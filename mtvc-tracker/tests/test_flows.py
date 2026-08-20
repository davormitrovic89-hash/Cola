"""
Smoke-Tests der Kernflows: Kontakt anlegen, Verlauf ergänzen, filtern, löschen.

Laufen ohne Server gegen eine temporäre SQLite-Datei:
    python3 tests/test_flows.py
(oder mit pytest, falls installiert)
"""

import sqlite3
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import create_app  # noqa: E402


def make_app():
    """Frische App auf einer temporären DB-Datei."""
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    app = create_app(db_path=tmp.name)
    app.config["TESTING"] = True
    return app, tmp.name


def make_client():
    return make_app()[0].test_client()


def text(response):
    return response.get_data(as_text=True)


def test_empty_overview():
    page = text(make_client().get("/"))
    assert "Noch keine Kontakte erfasst" in page


def test_create_contact_with_first_message():
    c = make_client()
    r = c.post(
        "/contact/new",
        data={
            "name": "Studio Belle Zürich",
            "segment": "Nagelstudio",
            "location": "Zürich",
            "channel": "Instagram DM",
            "instagram": "@studiobelle",
            "status": "Kontaktiert",
            "first_message": "Erste DM mit Bezug auf die Terminlücken am Dienstag.",
            "pain_point": "Viele Lücken unter der Woche.",
            "next_step": "Follow-up",
            "next_step_date": date.today().isoformat(),
        },
        follow_redirects=True,
    )
    page = text(r)
    assert r.status_code == 200
    assert "Studio Belle Zürich" in page
    assert "Erste DM mit Bezug" in page  # als Verlaufseintrag übernommen
    assert "Nachricht gesendet" in page


def test_name_is_required():
    c = make_client()
    r = c.post("/contact/new", data={"name": "   ", "location": "Basel"})
    assert r.status_code == 400
    assert "Bitte Unternehmen / Name angeben." in text(r)
    assert "Noch keine Kontakte erfasst" in text(c.get("/"))  # nichts gespeichert


def test_interaction_status_and_filters():
    c = make_client()
    c.post("/contact/new", data={"name": "Lash Lounge", "segment": "Wimpernstudio", "location": "Bern"},
           follow_redirects=True)
    c.post("/contact/new", data={"name": "Derma Praxis", "segment": "Medical Aesthetics", "location": "Zug"},
           follow_redirects=True)

    # Verlaufseintrag + Status-Update am ersten Kontakt
    c.post("/contact/1/interaction",
           data={"type": "Antwort erhalten", "entry_date": date.today().isoformat(),
                 "note": "Rückmeldung: Auslastung im Sommer eingebrochen."},
           follow_redirects=True)
    c.post("/contact/1/update",
           data={"name": "Lash Lounge", "segment": "Wimpernstudio", "location": "Bern",
                 "status": "Geantwortet", "pain_point": "Sommerloch",
                 "next_step": "Diagnosegespräch anbieten",
                 "next_step_date": (date.today() - timedelta(days=2)).isoformat()},
           follow_redirects=True)

    detail = text(c.get("/contact/1"))
    assert "Antwort erhalten" in detail
    assert "Sommerloch" in detail

    # Segmentfilter
    assert "Derma Praxis" not in text(c.get("/?segment=Wimpernstudio"))
    # Statusfilter
    assert "Lash Lounge" not in text(c.get("/?status=Kontaktiert"))
    # Volltextsuche greift auch in Verlaufsnotizen
    assert "Lash Lounge" in text(c.get("/?q=Auslastung"))
    # Schnellfilter „nur fällige"
    due = text(c.get("/?due_only=1"))
    assert "Lash Lounge" in due and "Derma Praxis" not in due
    assert "überfällig" in due


def test_closed_contacts_drop_out_of_counters():
    c = make_client()
    c.post("/contact/new", data={"name": "Abschluss AG", "next_step": "x",
                                 "next_step_date": date.today().isoformat()},
           follow_redirects=True)
    assert "nur fällige" in text(c.get("/"))
    assert "Abschluss AG" in text(c.get("/?due_only=1"))

    c.post("/contact/1/update", data={"name": "Abschluss AG", "status": "Kunde",
                                      "next_step": "x", "next_step_date": date.today().isoformat()},
           follow_redirects=True)
    assert "Abschluss AG" not in text(c.get("/?due_only=1"))


def test_delete_contact_removes_interactions():
    app, db_path = make_app()
    c = app.test_client()
    c.post("/contact/new", data={"name": "Weg Damit", "first_message": "Testnachricht"},
           follow_redirects=True)
    r = c.post("/contact/1/delete", follow_redirects=True)
    assert "gelöscht" in text(r)
    assert c.get("/contact/1").status_code == 404
    assert "Weg Damit" not in text(c.get("/"))

    # Verlaufseinträge müssen per Fremdschlüssel mitgelöscht werden.
    conn = sqlite3.connect(db_path)
    assert conn.execute("SELECT COUNT(*) FROM interactions").fetchone()[0] == 0
    conn.close()


def test_unknown_contact_is_404():
    assert make_client().get("/contact/999").status_code == 404


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"ok   {name}")
            except AssertionError as exc:
                failures += 1
                print(f"FAIL {name}: {exc}")
    print("---")
    print("alle Tests bestanden" if not failures else f"{failures} Test(s) fehlgeschlagen")
    sys.exit(1 if failures else 0)
