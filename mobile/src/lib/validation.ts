// Helpers de validacion y formateo para inputs en formato chileno.

// ---------------------------------------------------------------------------
// RUT (Rol Único Tributario) — formato XX.XXX.XXX-X con DV módulo 11
// ---------------------------------------------------------------------------

function cleanRut(input: string): string {
  return input.replace(/[^0-9kK]/g, '').toUpperCase()
}

/** Calcula el dígito verificador de un cuerpo numérico de RUT. */
function rutDV(numericBody: string): string {
  let sum = 0
  let mul = 2
  for (let i = numericBody.length - 1; i >= 0; i--) {
    sum += parseInt(numericBody[i], 10) * mul
    mul = mul === 7 ? 2 : mul + 1
  }
  const r = 11 - (sum % 11)
  if (r === 11) return '0'
  if (r === 10) return 'K'
  return String(r)
}

/** Valida un RUT chileno. Acepta con o sin puntos/guion. */
export function isValidRut(input: string): boolean {
  const clean = cleanRut(input)
  if (clean.length < 2) return false
  const body = clean.slice(0, -1)
  const dv = clean.slice(-1)
  if (!/^[0-9]+$/.test(body)) return false
  if (body.length < 7 || body.length > 8) return false
  return rutDV(body) === dv
}

/** Formatea mientras el usuario escribe: 12345678K → 12.345.678-K. */
export function formatRut(input: string): string {
  const clean = cleanRut(input)
  if (clean.length === 0) return ''
  if (clean.length === 1) return clean
  const body = clean.slice(0, -1)
  const dv = clean.slice(-1)
  const bodyDotted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${bodyDotted}-${dv}`
}

// ---------------------------------------------------------------------------
// Teléfono CL — móvil canonical: +56 9 XXXX XXXX (11 dígitos sin signos)
// ---------------------------------------------------------------------------

function digitsOnly(input: string): string {
  return input.replace(/\D/g, '')
}

/** Formatea mientras el usuario escribe a +56 9 XXXX XXXX. */
export function formatPhoneCl(input: string): string {
  let d = digitsOnly(input)
  // Si empieza con 56 lo conservamos. Si empieza con 9 (8 chars siguientes),
  // asumimos movil chileno y prefijamos. Si empieza con otro digito, dejamos
  // tal cual para no pisar al usuario que intenta otro pais.
  if (d.startsWith('569')) {
    // ok
  } else if (d.startsWith('56')) {
    // ok, esperando 9XXXXXXXX
  } else if (d.startsWith('9') && d.length <= 9) {
    d = '56' + d
  }

  if (d.length === 0) return ''
  if (!d.startsWith('56')) return `+${d}`

  // Construimos progresivamente.
  const rest = d.slice(2) // sin 56
  let out = '+56'
  if (rest.length === 0) return out
  out += ' ' + rest.slice(0, 1) // siempre el 9 (o lo que haya)
  if (rest.length > 1) out += ' ' + rest.slice(1, 5)
  if (rest.length > 5) out += ' ' + rest.slice(5, 9)
  return out
}

/** Valida que el teléfono sea un móvil chileno de 9 dígitos prefijado por 9. */
export function isValidPhoneCl(input: string): boolean {
  const d = digitsOnly(input)
  // 569XXXXXXXX (11) o 9XXXXXXXX (9)
  if (d.startsWith('569') && d.length === 11) return true
  if (d.startsWith('9') && d.length === 9) return true
  return false
}

/** Devuelve la versión canónica (con + y espacios) lista para guardar. */
export function canonicalPhoneCl(input: string): string {
  return formatPhoneCl(input)
}
