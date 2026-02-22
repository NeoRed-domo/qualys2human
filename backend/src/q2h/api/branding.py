"""Branding API — logo upload, retrieval, and template download."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from q2h.auth.dependencies import get_current_user, require_admin

router = APIRouter(prefix="/api/branding", tags=["branding"])

BRANDING_DIR = Path(__file__).parent.parent.parent.parent.parent / "data" / "branding"
DEFAULT_LOGO = BRANDING_DIR / "logo-default.svg"
CUSTOM_LOGO = BRANDING_DIR / "logo-custom"
TEMPLATE = BRANDING_DIR / "logo-template.svg"

MAX_LOGO_SIZE = 500 * 1024  # 500 KB
ALLOWED_EXTENSIONS = {".svg", ".png", ".jpg", ".jpeg"}


@router.get("/logo")
async def get_logo(user: dict = Depends(get_current_user)):
    """Return the current logo (custom if exists, otherwise default)."""
    # Check for custom logo with any extension
    for ext in ALLOWED_EXTENSIONS:
        candidate = CUSTOM_LOGO.with_suffix(ext)
        if candidate.exists():
            media = {
                ".svg": "image/svg+xml",
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
            }
            return FileResponse(candidate, media_type=media.get(ext, "application/octet-stream"))

    if DEFAULT_LOGO.exists():
        return FileResponse(DEFAULT_LOGO, media_type="image/svg+xml")

    raise HTTPException(404, "No logo found")


@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    user: dict = Depends(require_admin),
):
    """Upload a custom logo (admin only)."""
    if not file.filename:
        raise HTTPException(400, "No filename")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Extension not allowed. Use: {', '.join(ALLOWED_EXTENSIONS)}")

    content = await file.read()
    if len(content) > MAX_LOGO_SIZE:
        raise HTTPException(400, f"File too large (max {MAX_LOGO_SIZE // 1024} KB)")
    if len(content) == 0:
        raise HTTPException(400, "Empty file")

    # Remove any existing custom logos
    for old_ext in ALLOWED_EXTENSIONS:
        old = CUSTOM_LOGO.with_suffix(old_ext)
        if old.exists():
            old.unlink()

    # Save new custom logo
    target = CUSTOM_LOGO.with_suffix(ext)
    BRANDING_DIR.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)

    return {"message": "Logo uploaded", "filename": target.name}


@router.delete("/logo")
async def delete_logo(user: dict = Depends(require_admin)):
    """Delete custom logo, restoring default."""
    deleted = False
    for ext in ALLOWED_EXTENSIONS:
        candidate = CUSTOM_LOGO.with_suffix(ext)
        if candidate.exists():
            candidate.unlink()
            deleted = True

    if not deleted:
        raise HTTPException(404, "No custom logo to delete")

    return {"message": "Custom logo removed, default restored"}


@router.get("/template")
async def get_template(user: dict = Depends(get_current_user)):
    """Download the SVG logo template."""
    if not TEMPLATE.exists():
        raise HTTPException(404, "Template not found")
    return FileResponse(
        TEMPLATE,
        media_type="image/svg+xml",
        filename="logo-template.svg",
    )
