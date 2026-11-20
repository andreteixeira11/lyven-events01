#!/usr/bin/env python3
"""Testa o web service de atualizações da Apple Wallet (função wallet-pass).

Simula um iPhone: descarrega o passe, regista-o com um push token falso,
pergunta por atualizações, descarrega o passe pelo web service e envia um
aviso (notify). Com um token falso a APNs responde 400 BadDeviceToken, o que
prova que a ligação com o certificado funciona; o registo é então apagado.

Uso: python3 scripts/test-wallet-updates.py <ticket_id> <notify_secret>
Requer SUPABASE_ACCESS_TOKEN no ambiente.
"""
import base64
import hashlib
import hmac
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
import zipfile

REF = "fmjgrewkknqvxqwkouqj"
BASE = f"https://{REF}.supabase.co/functions/v1/wallet-pass"


def call(url, method="GET", body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json", **(headers or {})})
    try:
        r = urllib.request.urlopen(req)
        return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)


def main():
    ticket_id, notify_secret = sys.argv[1], sys.argv[2]
    tok = os.environ["SUPABASE_ACCESS_TOKEN"]
    keys = json.load(urllib.request.urlopen(urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/api-keys?reveal=true", headers={"Authorization": "Bearer " + tok})))
    secret = [k for k in keys if k.get("type") == "secret"][0]["api_key"]
    b = lambda x: base64.urlsafe_b64encode(x).decode().rstrip("=")
    payload = b(json.dumps({"t": ticket_id, "u": "test", "e": int(time.time() * 1000) + 600000}).encode())
    sig = b(hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest())

    s, data, _ = call(f"{BASE}?token={payload}.{sig}")
    print("1. download passe:", s)
    pj = json.loads(zipfile.ZipFile(io.BytesIO(data)).read("pass.json"))
    print("   webServiceURL:", pj.get("webServiceURL"), "| data:", pj["eventTicket"]["secondaryFields"][0]["value"])
    auth = {"Authorization": "ApplePass " + pj["authenticationToken"]}
    ptid = pj["passTypeIdentifier"]
    device = "test-device-rork"
    reg = f"{BASE}/v1/devices/{device}/registrations/{ptid}/{ticket_id}"

    print("2. registo sem token:", call(reg, "POST", {"pushToken": "00" * 32})[0], "(esperado 401)")
    print("3. registo:", call(reg, "POST", {"pushToken": "00" * 32}, auth)[0], "(esperado 201)")
    print("4. registo repetido:", call(reg, "POST", {"pushToken": "00" * 32}, auth)[0], "(esperado 200)")
    s, data, _ = call(f"{BASE}/v1/devices/{device}/registrations/{ptid}")
    print("5. lista de passes:", s, data.decode())
    last = json.loads(data)["lastUpdated"]
    print("6. sem alterações desde lastUpdated:", call(f"{BASE}/v1/devices/{device}/registrations/{ptid}?passesUpdatedSince={last}")[0], "(esperado 204)")
    s, data, h = call(f"{BASE}/v1/passes/{ptid}/{ticket_id}", headers=auth)
    print("7. passe pelo web service:", s, len(data), "bytes, Last-Modified:", h.get("Last-Modified"))
    print("8. If-Modified-Since:", call(f"{BASE}/v1/passes/{ptid}/{ticket_id}", headers={**auth, "If-Modified-Since": h.get("Last-Modified")})[0], "(esperado 304)")
    print("9. log:", call(f"{BASE}/v1/log", "POST", {"logs": ["teste"]})[0])
    eid = ticket_id.split("_event_")[-1] if "_event_" in ticket_id else None
    s, data, _ = call(f"{BASE}/notify", "POST", {"eventId": sys.argv[3] if len(sys.argv) > 3 else eid}, {"x-wallet-notify-secret": notify_secret})
    print("10. notify (APNs):", s, data.decode())
    print("11. notify sem segredo:", call(f"{BASE}/notify", "POST", {"eventId": "x"})[0], "(esperado 401)")
    print("12. remover registo:", call(reg, "DELETE", None, auth)[0])


if __name__ == "__main__":
    main()
