# ADR 006: Permisos por módulo con roles y excepciones por usuario

Estado: Aceptada

## Contexto

La agencia tiene perfiles distintos (gerencia, finanzas, operaciones, ventas) y necesita casos puntuales sin crear un rol nuevo.

## Decisión

Permisos con nombre (`VIEW_*`, `MANAGE_*`, `DELETE_*`) agrupados en roles; cada usuario puede tener excepciones que conceden o revocan un permiso. Los cambios se auditan. Verificación en el API con `requirePermission`.

## Alternativas consideradas

- Dos roles fijos (administrador y usuario): insuficiente para el negocio.
- Un sistema de políticas (ABAC): excesivo para el tamaño actual.

## Consecuencias

+ Cada pantalla y endpoint declara qué permiso exige.
- Hay muchas combinaciones: solo parte está cubierta por pruebas; los controladores de usuarios y permisos tienen cobertura baja.
- El cliente replica la lógica para ocultar menús; la autoridad es el API.
