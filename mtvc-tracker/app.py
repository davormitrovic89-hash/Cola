"""
MTVC Lead & Conversation Tracker
================================

Internes Akquise-Werkzeug für MTVC (Single-User-MVP, lokal lauffähig).

Stack bewusst schlank gehalten: Flask + Jinja2 + SQLite-Datei, kein externer
DB-Server, kein Login, kein Build-Schritt. Die App ist als Factory
(`create_app`) aufgebaut, damit später ein anderer DB-Pfad, Tests oder ein
zweiter Mandant möglich sind, ohne die Struktur umzubauen.
"""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import date, datetime
from pathlib import Path

from flask import (
    Flask,
    abort,
    flash,
    g,
    redirect,
    render_template,
    request,
    url_for,
)

APP_DIR = Path(__file__).parent
DEFAULT_DB_PATH = APP_DIR / "mtvc_tracker.db"

# ---------------------------------------------------------------------------
# Feste Auswahlwerte. Bewusst als Listen im Code (nicht in der DB): der MVP hat
# einen Nutzer, und Änderungen an diesen Werten sind Produktentscheidungen.
# ---------------------------------------------------------------------------

SEGMENTS = [
    "Nagelstudio",
    "Wimpernstudio",
    "Kosmetikstudio",
    "Laserstudio",
    "Medical Aesthetics",
    "Klinik / mehrere Standorte",
    "Sonstiges",
]

CHANNELS = [
    "Instagram DM",
    "WhatsApp",
    "Persönlich",
    "E-Mail",
    "Sonstiges",
]

STATUSES = [
    "Kontaktiert",
    "Geantwortet",
    "Gespräch vereinbart",
    "Diagnose / Audit",
    "Angebot",
    "Kunde",
    "Kein Interesse",
    "Keine Rückmeldung",
]

DEFAULT_STATUS = "Kontaktiert"

# Status, die einen Kontakt abschliessen – zählen nicht als "aktiv" und
# erzeugen keine fälligen Schritte mehr.
CLOSED_STATUSES = ("Kunde", "Kein Interesse")

INTERACTION_TYPES = [
    "Nachricht gesendet",
    "Antwort erhalten",
    "Gespräch geführt",
    "Notiz",
]

DEFAULT_INTERACTION_TYPE = "Notiz"

SCHEMA = """
CREATE TABLE IF NOT EXISTS contacts (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT NOT NULL,
    segment             TEXT NOT NULL DEFAULT '',
    location            TEXT NOT NULL DEFAULT '',
    channel             TEXT NOT NULL DEFAULT '',
    instagram           TEXT NOT NULL DEFAULT '',
    personal_connection TEXT NOT NULL DEFAULT '',
    status              TEXT NOT NULL DEFAULT 'Kontaktiert',
    pain_point          TEXT NOT NULL DEFAULT '',
    next_step           TEXT NOT NULL DEFAULT '',
    next_step_date      TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id  INTEGER NOT NULL,
    entry_date  TEXT NOT NULL,
    type        TEXT NOT NULL,
    note        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    FOREIGN KEY (contact_id) REFERENCES contacts (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_interactions_contact
    ON interactions (contact_id, entry_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_contacts_due
    ON contacts (next_step_date);
"""


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def today_str() -> str:
    return date.today().isoformat()


def now_str() -> str:
    return datetime.now().isoformat(timespec="seconds")


def clean(value: str | None) -> str:
    """Freitext normalisieren: nie None, keine Rand-Leerzeichen."""
    return (value or "").strip()


def pick(value: str | None, allowed: list[str], default: str = "") -> str:
    """Auswahlfeld gegen die erlaubten Werte prüfen (Schutz vor manipulierten
    Formularen und vor Tippfehlern in Templates)."""
    value = clean(value)
    return value if value in allowed else default


def parse_date(value: str | None) -> str | None:
    """ISO-Datum aus dem Formular übernehmen, sonst None (Feld bleibt leer)."""
    value = clean(value)
    if not value:
        return None
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        return None


def form_to_contact(form) -> dict:
    """Formulardaten in ein sauberes Kontakt-Dict überführen."""
    return {
        "name": clean(form.get("name")),
        "segment": pick(form.get("segment"), SEGMENTS),
        "location": clean(form.get("location")),
        "channel": pick(form.get("channel"), CHANNELS),
        "instagram": clean(form.get("instagram")),
        "personal_connection": clean(form.get("personal_connection")),
        "status": pick(form.get("status"), STATUSES, DEFAULT_STATUS),
        "pain_point": clean(form.get("pain_point")),
        "next_step": clean(form.get("next_step")),
        "next_step_date": parse_date(form.get("next_step_date")),
    }


def closed_placeholders() -> str:
    """Platzhalter-Liste für die abgeschlossenen Status."""
    return ", ".join("?" for _ in CLOSED_STATUSES)


def is_due_sql() -> str:
    """SQL-Bedingung für „fälliger/überfälliger Schritt".

    Erwartet die Parameter aus :func:`due_params` in dieser Reihenfolge.
    Abgeschlossene Kontakte (Kunde / Kein Interesse) zählen nicht mehr.
    """
    return (
        "next_step_date IS NOT NULL AND next_step_date <= ? "
        f"AND status NOT IN ({closed_placeholders()})"
    )


def due_params(today: str) -> list:
    return [today, *CLOSED_STATUSES]


# ---------------------------------------------------------------------------
# Datenbank
# ---------------------------------------------------------------------------

def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(g.db_path if "db_path" in g else DEFAULT_DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


def init_db(db_path: Path) -> None:
    """Schema beim Start anlegen (idempotent)."""
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def fetch_contact(contact_id: int) -> sqlite3.Row:
    row = get_db().execute(
        "SELECT * FROM contacts WHERE id = ?", (contact_id,)
    ).fetchone()
    if row is None:
        abort(404)
    return row


# ---------------------------------------------------------------------------
# App-Factory
# ---------------------------------------------------------------------------

def create_app(db_path: str | os.PathLike | None = None) -> Flask:
    app = Flask(__name__)
    app.config["DB_PATH"] = Path(db_path or os.environ.get("MTVC_DB_PATH") or DEFAULT_DB_PATH)

    # Secret Key nur für Flash-Nachrichten. Aus der Umgebung, sonst pro Start
    # neu generiert – so liegt nie ein Schlüssel im Repo.
    app.secret_key = os.environ.get("MTVC_SECRET_KEY") or secrets.token_hex(16)

    init_db(app.config["DB_PATH"])

    @app.before_request
    def _bind_db_path():
        g.db_path = app.config["DB_PATH"]

    @app.teardown_appcontext
    def _close_db(_exc):
        db = g.pop("db", None)
        if db is not None:
            db.close()

    # -- Übersicht ----------------------------------------------------------

    @app.route("/")
    def index():
        db = get_db()
        today = today_str()

        segment = pick(request.args.get("segment"), SEGMENTS)
        status = pick(request.args.get("status"), STATUSES)
        q = clean(request.args.get("q"))
        due_only = bool(request.args.get("due_only"))

        where = ["1=1"]
        params: list = []

        if segment:
            where.append("segment = ?")
            params.append(segment)
        if status:
            where.append("status = ?")
            params.append(status)
        if q:
            # Volltextsuche über Stammdaten, Pain Point und Verlaufsnotizen.
            where.append(
                """(
                    name LIKE ?
                    OR location LIKE ?
                    OR pain_point LIKE ?
                    OR personal_connection LIKE ?
                    OR next_step LIKE ?
                    OR instagram LIKE ?
                    OR EXISTS (
                        SELECT 1 FROM interactions i
                        WHERE i.contact_id = contacts.id AND i.note LIKE ?
                    )
                )"""
            )
            params.extend([f"%{q}%"] * 7)
        if due_only:
            where.append(is_due_sql())
            params.extend(due_params(today))

        # Offene, fällige Schritte zuerst; danach nach Fälligkeit, zum Schluss
        # Kontakte ohne Datum (nach letzter Aktivität).
        sql = f"""
            SELECT * FROM contacts
            WHERE {' AND '.join(where)}
            ORDER BY (next_step_date IS NULL), next_step_date ASC, updated_at DESC
        """
        contacts = db.execute(sql, params).fetchall()

        # Kennzahlen immer über den Gesamtbestand, unabhängig vom Filter.
        active_count = db.execute(
            f"SELECT COUNT(*) FROM contacts WHERE status NOT IN ({closed_placeholders()})",
            CLOSED_STATUSES,
        ).fetchone()[0]
        due_count = db.execute(
            f"SELECT COUNT(*) FROM contacts WHERE {is_due_sql()}", due_params(today)
        ).fetchone()[0]

        return render_template(
            "index.html",
            contacts=contacts,
            segments=SEGMENTS,
            statuses=STATUSES,
            selected_segment=segment,
            selected_status=status,
            q=q,
            due_only=due_only,
            today=today,
            active_count=active_count,
            due_count=due_count,
            closed_statuses=CLOSED_STATUSES,
        )

    # -- Kontakt anlegen ----------------------------------------------------

    @app.route("/contact/new", methods=["GET", "POST"])
    def new_contact():
        if request.method == "POST":
            data = form_to_contact(request.form)
            first_message = clean(request.form.get("first_message"))

            if not data["name"]:
                # Formular mit den eingegebenen Werten erneut anzeigen.
                return (
                    render_template(
                        "new_contact.html",
                        segments=SEGMENTS,
                        channels=CHANNELS,
                        statuses=STATUSES,
                        today=today_str(),
                        error="Bitte Unternehmen / Name angeben.",
                        form=data,
                        first_message=first_message,
                    ),
                    400,
                )

            db = get_db()
            now = now_str()
            cur = db.execute(
                """INSERT INTO contacts
                   (name, segment, location, channel, instagram, personal_connection,
                    status, pain_point, next_step, next_step_date, created_at, updated_at)
                   VALUES (:name, :segment, :location, :channel, :instagram,
                           :personal_connection, :status, :pain_point, :next_step,
                           :next_step_date, :created_at, :updated_at)""",
                {**data, "created_at": now, "updated_at": now},
            )
            contact_id = cur.lastrowid

            if first_message:
                db.execute(
                    """INSERT INTO interactions (contact_id, entry_date, type, note, created_at)
                       VALUES (?, ?, ?, ?, ?)""",
                    (contact_id, today_str(), "Nachricht gesendet", first_message, now),
                )

            db.commit()
            flash("Kontakt angelegt.")
            return redirect(url_for("contact_detail", contact_id=contact_id))

        return render_template(
            "new_contact.html",
            segments=SEGMENTS,
            channels=CHANNELS,
            statuses=STATUSES,
            today=today_str(),
            error=None,
            form=None,
            first_message="",
        )

    # -- Detailansicht ------------------------------------------------------

    @app.route("/contact/<int:contact_id>")
    def contact_detail(contact_id: int):
        contact = fetch_contact(contact_id)
        interactions = get_db().execute(
            """SELECT * FROM interactions
               WHERE contact_id = ?
               ORDER BY entry_date DESC, id DESC""",
            (contact_id,),
        ).fetchall()
        return render_template(
            "contact.html",
            contact=contact,
            interactions=interactions,
            segments=SEGMENTS,
            channels=CHANNELS,
            statuses=STATUSES,
            interaction_types=INTERACTION_TYPES,
            today=today_str(),
        )

    @app.route("/contact/<int:contact_id>/update", methods=["POST"])
    def update_contact(contact_id: int):
        contact = fetch_contact(contact_id)
        data = form_to_contact(request.form)

        if not data["name"]:
            flash("Name darf nicht leer sein – Änderungen wurden nicht gespeichert.")
            return redirect(url_for("contact_detail", contact_id=contact["id"]))

        get_db().execute(
            """UPDATE contacts SET
                   name = :name, segment = :segment, location = :location,
                   channel = :channel, instagram = :instagram,
                   personal_connection = :personal_connection, status = :status,
                   pain_point = :pain_point, next_step = :next_step,
                   next_step_date = :next_step_date, updated_at = :updated_at
               WHERE id = :id""",
            {**data, "updated_at": now_str(), "id": contact_id},
        )
        get_db().commit()
        flash("Änderungen gespeichert.")
        return redirect(url_for("contact_detail", contact_id=contact_id))

    # -- Verlauf ------------------------------------------------------------

    @app.route("/contact/<int:contact_id>/interaction", methods=["POST"])
    def add_interaction(contact_id: int):
        fetch_contact(contact_id)
        note = clean(request.form.get("note"))

        if not note:
            flash("Verlaufseintrag braucht eine Notiz.")
            return redirect(url_for("contact_detail", contact_id=contact_id))

        db = get_db()
        now = now_str()
        db.execute(
            """INSERT INTO interactions (contact_id, entry_date, type, note, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            (
                contact_id,
                parse_date(request.form.get("entry_date")) or today_str(),
                pick(request.form.get("type"), INTERACTION_TYPES, DEFAULT_INTERACTION_TYPE),
                note,
                now,
            ),
        )
        db.execute("UPDATE contacts SET updated_at = ? WHERE id = ?", (now, contact_id))
        db.commit()
        return redirect(url_for("contact_detail", contact_id=contact_id))

    # -- Löschen ------------------------------------------------------------

    @app.route("/contact/<int:contact_id>/delete", methods=["POST"])
    def delete_contact(contact_id: int):
        contact = fetch_contact(contact_id)
        db = get_db()
        db.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
        db.commit()
        flash(f"Kontakt „{contact['name']}“ gelöscht.")
        return redirect(url_for("index"))

    @app.errorhandler(404)
    def not_found(_exc):
        return render_template("404.html"), 404

    return app


app = create_app()


if __name__ == "__main__":
    # host=0.0.0.0, damit das Tool im selben WLAN auch vom Handy erreichbar ist.
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5050)), debug=True)
