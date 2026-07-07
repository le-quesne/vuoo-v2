# Deuda técnica — vuoo-v2

Registro de **agujeros conocidos** en el código: bugs no resueltos, atajos pragmáticos, supuestos frágiles, validaciones faltantes, hacks temporales, mocks que deberían ser reales, decisiones diferidas.

> **Regla de oro**: si lo dejamos pasar conscientemente, queda acá. Si no queda acá, no existe — y se va a olvidar.

## Cómo usar esta carpeta

1. **Antes de tocar un área**, revisa si tiene entradas abiertas en la tabla de abajo. Si hay deuda relacionada, considérala (puede que tu cambio sea la oportunidad de cerrarla, o puede que la empeore).
2. **Al detectar un agujero nuevo** (propio o ajeno) que decides no arreglar ahora, **crea el archivo antes de seguir**. Copia [`_TEMPLATE.md`](./_TEMPLATE.md) → `NNNN-slug-corto.md` (numeración correlativa, 4 dígitos).
3. **Al cerrar deuda** (PR que la resuelve): mueve la entrada a la sección `Resueltos` con la fecha y el commit/PR que la cerró. No borres el archivo — el historial sirve.
4. **Mensualmente** (o cuando duela): revisa `open` y reclasifica lo que ya no aplique a `obsolete`.

## Estados

| Estado | Significado |
|--------|-------------|
| `open` | Existe, no se está trabajando. |
| `in-progress` | Hay PR/rama activa atacándolo. |
| `mitigated` | No arreglado pero con workaround o guardrail que reduce impacto. |
| `fixed` | Resuelto. Mantener archivo como referencia histórica. |
| `obsolete` | Ya no aplica (código eliminado, decisión revertida). |

## Abiertos

| ID | Título | Área | Severidad | Estado | Creado |
|----|--------|------|-----------|--------|--------|
| [0001](./0001-stops-customer-denorm.md) | `stops.customer_email/phone` duplican datos del Customer master | stops | medium | open | 2026-05-22 |
| [0002](./0002-import-preview-no-match.md) | Preview del Import Wizard nunca muestra matches contra customers / stops | orders | medium | open | 2026-05-24 |
| [0004](./0004-ordermodal-stop-name-sin-place.md) | OrderModal crea stops con name = customer_name (sin campo lugar) | orders, stops | low | open | 2026-07-07 |

## Resueltos

| ID | Título | Cerrado por | Fecha |
|----|--------|-------------|-------|
| [0003](./0003-optimizer-includes-completed-stops.md) | Re-optimización con completadas — capacidad inflada y orden mezclado | feat/control-minimalista | 2026-05-24 |
