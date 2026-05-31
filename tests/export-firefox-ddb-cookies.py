import argparse
import json
import os
import shutil
import sqlite3
import tempfile
from pathlib import Path


DDB_HOST_MATCHES = (
    "dndbeyond.com",
    "www.dndbeyond.com",
    ".dndbeyond.com",
)


def firefox_profiles_dir() -> Path:
    appdata = os.environ.get("APPDATA")
    if not appdata:
        raise RuntimeError("APPDATA is not set; cannot locate Firefox profiles")
    return Path(appdata) / "Mozilla" / "Firefox" / "Profiles"


def candidate_cookie_dbs(profile: str | None) -> list[Path]:
    profiles_dir = firefox_profiles_dir()
    if profile:
        profile_path = Path(profile)
        if not profile_path.is_absolute():
            profile_path = profiles_dir / profile
        return [profile_path / "cookies.sqlite"]
    return sorted(profiles_dir.glob("*/cookies.sqlite"), key=lambda item: item.stat().st_mtime, reverse=True)


def same_site(value: int) -> str:
    # Firefox stores 0 as no restriction, 1 as lax, and 2 as strict.
    return {1: "Lax", 2: "Strict"}.get(value, "None")


def is_ddb_cookie(host: str) -> bool:
    return any(host == match or host.endswith("." + match.lstrip(".")) for match in DDB_HOST_MATCHES)


def read_cookies(db_path: Path) -> list[dict]:
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as temp_file:
        temp_path = Path(temp_file.name)
    try:
        shutil.copy2(db_path, temp_path)
        with sqlite3.connect(temp_path) as connection:
            connection.row_factory = sqlite3.Row
            rows = connection.execute(
                """
                SELECT host, name, value, path, expiry, isSecure, isHttpOnly, sameSite
                FROM moz_cookies
                WHERE host LIKE '%dndbeyond.com'
                ORDER BY host, name
                """
            ).fetchall()
    finally:
        try:
            temp_path.unlink(missing_ok=True)
        except PermissionError:
            pass

    cookies = []
    for row in rows:
        host = row["host"]
        if not is_ddb_cookie(host):
            continue
        expiry = int(row["expiry"]) if row["expiry"] else -1
        if expiry > 99_999_999_999:
            expiry = expiry // 1000
        if expiry <= 0:
            expiry = -1
        cookie = {
            "name": row["name"],
            "value": row["value"],
            "domain": host,
            "path": row["path"] or "/",
            "expires": expiry,
            "httpOnly": bool(row["isHttpOnly"]),
            "secure": bool(row["isSecure"]),
            "sameSite": same_site(int(row["sameSite"] or 0)),
        }
        cookies.append(cookie)
    return cookies


def main() -> None:
    parser = argparse.ArgumentParser(description="Export D&D Beyond Firefox cookies for Playwright.")
    parser.add_argument("--profile", help="Firefox profile name or absolute profile path.")
    parser.add_argument(
        "--out",
        default=str(Path.home() / ".ddb-live-campaign-firefox-cookies.json"),
        help="Output JSON path.",
    )
    args = parser.parse_args()

    dbs = candidate_cookie_dbs(args.profile)
    attempts = []
    for db_path in dbs:
        if not db_path.exists():
            attempts.append({"path": str(db_path), "cookies": 0, "exists": False})
            continue
        cookies = read_cookies(db_path)
        attempts.append({"path": str(db_path), "cookies": len(cookies), "exists": True})
        if cookies:
            out_path = Path(args.out)
            out_path.write_text(json.dumps(cookies, indent=2), encoding="utf-8")
            print(json.dumps({"out": str(out_path), "cookies": len(cookies), "profile": str(db_path.parent)}, indent=2))
            return

    raise SystemExit("No D&D Beyond cookies found in Firefox profiles: " + json.dumps(attempts, indent=2))


if __name__ == "__main__":
    main()
