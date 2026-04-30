// Genera los PNG de app icon, adaptive icon y splash a partir del wordmark
// Vuoo (public/logo_vuoo.svg). Idempotente — correr cuando cambie el logo.
//
// Uso: node mobile/scripts/generate-app-icons.mjs

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')
const assetsDir = resolve(__dirname, '..', 'assets')

const NAVY = '#0a0e1a'
const WHITE = '#ffffff'

// Tomamos el simbolo del favicon (la "O" estilizada de Vuoo) — queda mucho
// mas reconocible como app icon que el wordmark de 4 letras. Extraemos solo
// el <path> del simbolo y descartamos el <circle> de fondo (no lo necesitamos
// porque pintamos el canvas navy directamente).
const faviconPath = resolve(repoRoot, 'public', 'favicon.svg')
const faviconRaw = readFileSync(faviconPath, 'utf8')
const symbolMatch = faviconRaw.match(/<path[^>]*d="([^"]+)"[^>]*\/>/)
if (!symbolMatch) {
  throw new Error('No se encontro el path del simbolo en favicon.svg')
}
const symbolD = symbolMatch[1]
// Construimos un SVG limpio con el simbolo blanco sobre transparente.
const wordmarkSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
  <path fill="${WHITE}" d="${symbolD}"/>
</svg>`

mkdirSync(assetsDir, { recursive: true })

// Renderizamos el SVG grande, trimmeamos bordes transparentes y guardamos
// el wordmark como buffer reutilizable. Solo asi ocupa el ancho real del
// canvas (el SVG fuente tiene mucho aire vertical alrededor del texto).
const wordmarkRaw = await sharp(Buffer.from(wordmarkSvg), { density: 800 })
  .png()
  .toBuffer()
const trimmedMeta = await sharp(wordmarkRaw)
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
  .toBuffer({ resolveWithObject: true })
const trimmedBuffer = trimmedMeta.data
const trimmedW = trimmedMeta.info.width
const trimmedH = trimmedMeta.info.height

async function compose({ output, size, padding, withBackground = true, height }) {
  const canvasW = size
  const canvasH = height ?? size
  const innerW = canvasW - padding * 2
  // Escalamos el wordmark trimeado para que llene `innerW` de ancho,
  // preservando su aspect ratio real (~3.3:1).
  const targetH = Math.round((innerW * trimmedH) / trimmedW)
  const logoBuffer = await sharp(trimmedBuffer)
    .resize({ width: innerW, height: targetH, fit: 'fill' })
    .png()
    .toBuffer()

  const offsetX = Math.floor((canvasW - innerW) / 2)
  const offsetY = Math.floor((canvasH - targetH) / 2)

  const base = withBackground
    ? sharp({
        create: {
          width: canvasW,
          height: canvasH,
          channels: 4,
          background: NAVY,
        },
      })
    : sharp({
        create: {
          width: canvasW,
          height: canvasH,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })

  await base
    .composite([{ input: logoBuffer, top: offsetY, left: offsetX }])
    .png()
    .toFile(output)
  console.log(`✓ ${output}`)
}

async function main() {
  // App icon — 1024×1024. El simbolo es ~cuadrado, asi que un padding del
  // 20% lo deja respirar sin verse pequeno.
  await compose({
    output: resolve(assetsDir, 'icon.png'),
    size: 1024,
    padding: 200,
  })
  // Adaptive icon (Android) — 1024×1024 con safe area mayor (~28%) porque
  // las mascaras circulares de Android recortan bordes.
  await compose({
    output: resolve(assetsDir, 'adaptive-icon.png'),
    size: 1024,
    padding: 290,
    withBackground: false,
  })
  // Splash — 1284×2778 (iPhone 14 Pro Max). El simbolo es mas chico para
  // que se sienta como pantalla de carga, no logo gigante.
  await compose({
    output: resolve(assetsDir, 'splash.png'),
    size: 1284,
    height: 2778,
    padding: 460,
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
