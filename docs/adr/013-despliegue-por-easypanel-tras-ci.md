# ADR 013: Despliegue en Easypanel disparado por el CI

Estado: Aceptada

## Contexto

Un solo VPS con otras aplicaciones; se quiere desplegar desde `main` sin pasos manuales.

## Decisión

GitHub Actions instala, migra una base de CI, compila y prueba; solo si todo pasa en un `push` a `main`, llama al *webhook* de despliegue de Easypanel (guardado como secreto). Easypanel construye la imagen Docker.

## Alternativas consideradas

- Kubernetes o una plataforma gestionada: más capacidad y más coste y complejidad de los necesarios.
- Despliegue manual: lento y propenso a errores.

## Consecuencias

+ Despliegue reproducible y con puerta de pruebas.
- `main` no está protegida: hoy se puede subir código sin que el CI lo apruebe antes (el CI se ejecuta después del *push*).
- Una sola instancia: sin alta disponibilidad; la vuelta atrás es manual (runbook).
