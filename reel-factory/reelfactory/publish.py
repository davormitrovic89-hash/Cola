"""Veröffentlichung des fertigen Reels über einen Scheduler.

Wichtig — Stand 2026: keiner der gängigen Scheduler nimmt einen Video-Upload
direkt per Multipart entgegen. Alle erwarten eine **öffentlich erreichbare URL**
der MP4-Datei (S3, Cloudflare R2, Bunny, Google Drive mit Direktlink …).
Deshalb hat jeder Provider hier ein `media_url`-Feld, und `dryrun` ist der
Default, damit nie versehentlich gepostet wird.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

import requests

REQUEST_TIMEOUT = 60


class PublishError(RuntimeError):
    """Der Scheduler hat den Post abgelehnt oder die Konfiguration ist unvollständig."""


@dataclass
class PublishRequest:
    caption: str
    video: Path
    media_url: str | None
    platforms: list[str]
    schedule_at: str | None
    settings: dict[str, Any]


@dataclass
class PublishResult:
    provider: str
    ok: bool
    detail: str
    response: dict[str, Any] | None = None


def _require_media_url(req: PublishRequest, provider: str) -> str:
    if not req.media_url:
        raise PublishError(
            f"{provider} braucht eine öffentlich erreichbare Video-URL.\n"
            f"Lade {req.video} zu S3/R2/Bunny hoch und setze publish.media_url "
            "in der brand.yaml oder --media-url."
        )
    return req.media_url


def _env(name: str, provider: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise PublishError(f"Umgebungsvariable {name} ist nicht gesetzt (für provider: {provider}).")
    return value


# --- Provider ---------------------------------------------------------------

def publish_dryrun(req: PublishRequest) -> PublishResult:
    payload = {
        "caption": req.caption,
        "video": str(req.video),
        "media_url": req.media_url,
        "platforms": req.platforms,
        "schedule_at": req.schedule_at,
    }
    sidecar = req.video.with_suffix(".publish.json")
    sidecar.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return PublishResult(
        provider="dryrun",
        ok=True,
        detail=f"Nichts gepostet. Payload geschrieben nach {sidecar}",
        response=payload,
    )


def publish_ayrshare(req: PublishRequest) -> PublishResult:
    """https://api.ayrshare.com/api/post — Bearer-Key aus AYRSHARE_API_KEY."""
    key = _env(req.settings.get("api_key_env", "AYRSHARE_API_KEY"), "ayrshare")
    body: dict[str, Any] = {
        "post": req.caption,
        "platforms": req.platforms,
        "mediaUrls": [_require_media_url(req, "Ayrshare")],
        "isVideo": True,
    }
    if req.schedule_at:
        body["scheduleDate"] = req.schedule_at

    response = requests.post(
        req.settings.get("endpoint") or "https://api.ayrshare.com/api/post",
        json=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        timeout=REQUEST_TIMEOUT,
    )
    return _finish("ayrshare", response)


def publish_buffer(req: PublishRequest) -> PublishResult:
    """Buffer-API (Personal-Key-Beta).

    Buffer vergibt seit 2019 keine neuen OAuth-Client-IDs mehr; aktuell gibt es
    nur persönliche API-Keys auf Antrag. Medien werden per öffentlicher URL
    referenziert, nicht hochgeladen.
    """
    token = _env(req.settings.get("api_key_env", "BUFFER_ACCESS_TOKEN"), "buffer")
    profile_ids = req.settings.get("profile_ids") or []
    if not profile_ids:
        raise PublishError("publish.profile_ids ist leer — Buffer braucht mindestens eine Profil-ID.")

    media_url = _require_media_url(req, "Buffer")
    form: list[tuple[str, str]] = [("text", req.caption), ("access_token", token)]
    form += [("profile_ids[]", pid) for pid in profile_ids]
    form += [("media[video]", media_url), ("media[link]", media_url)]
    if req.schedule_at:
        form.append(("scheduled_at", req.schedule_at))
    else:
        form.append(("now", "true"))

    response = requests.post(
        req.settings.get("endpoint") or "https://api.bufferapp.com/1/updates/create.json",
        data=form,
        timeout=REQUEST_TIMEOUT,
    )
    return _finish("buffer", response)


def publish_webhook(req: PublishRequest) -> PublishResult:
    """Generischer POST an n8n / Make / Zapier / eigenen Endpunkt."""
    endpoint = req.settings.get("endpoint")
    if not endpoint:
        raise PublishError("publish.endpoint fehlt (für provider: webhook).")

    headers = {"Content-Type": "application/json"}
    token_env = req.settings.get("api_key_env")
    if token_env and os.environ.get(token_env):
        headers["Authorization"] = f"Bearer {os.environ[token_env]}"

    response = requests.post(
        endpoint,
        json={
            "caption": req.caption,
            "media_url": req.media_url,
            "video_path": str(req.video),
            "platforms": req.platforms,
            "schedule_at": req.schedule_at,
        },
        headers=headers,
        timeout=REQUEST_TIMEOUT,
    )
    return _finish("webhook", response)


PROVIDERS: dict[str, Callable[[PublishRequest], PublishResult]] = {
    "dryrun": publish_dryrun,
    "ayrshare": publish_ayrshare,
    "buffer": publish_buffer,
    "webhook": publish_webhook,
}


def _finish(provider: str, response: requests.Response) -> PublishResult:
    try:
        data = response.json()
    except ValueError:
        data = {"raw": response.text[:2000]}

    if not response.ok:
        raise PublishError(f"{provider} antwortete mit HTTP {response.status_code}: {data}")
    return PublishResult(provider=provider, ok=True, detail=f"HTTP {response.status_code}", response=data)


def publish(caption: str, video: Path, settings: dict[str, Any]) -> PublishResult:
    provider = settings.get("provider", "dryrun")
    handler = PROVIDERS.get(provider)
    if handler is None:
        raise PublishError(
            f"Unbekannter Provider '{provider}'. Verfügbar: {', '.join(sorted(PROVIDERS))}"
        )
    request = PublishRequest(
        caption=caption,
        video=Path(video),
        media_url=settings.get("media_url"),
        platforms=list(settings.get("platforms") or []),
        schedule_at=settings.get("schedule_at"),
        settings=settings,
    )
    return handler(request)
