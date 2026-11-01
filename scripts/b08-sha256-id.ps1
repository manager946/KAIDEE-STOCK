# KAIDEE-STOCK B08 — compute the SHA-256 of a Google spreadsheet/script ID on the owner's own Windows machine.
# The ID is read as a SecureString (not echoed, not stored in PowerShell history) and only the 64-hex hash
# is printed. Nothing is sent anywhere. Paste the hash into KAIDEE_B08_*_SHA256 / KAIDEE_B08_DENYLIST_SHA256.
# Usage (PowerShell 5.1+):  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\b08-sha256-id.ps1
$ErrorActionPreference = 'Stop'
$secure = Read-Host -Prompt 'Paste the ID (input hidden)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $id = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim()
  if ($id -notmatch '^[A-Za-z0-9_-]{20,}$') { throw 'Input does not look like a Google ID; nothing computed.' }
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $bytes = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($id)) } finally { $sha.Dispose() }
  ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Variable id -ErrorAction SilentlyContinue
}
