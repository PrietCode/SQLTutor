# SQLTutor

SQLTutor es una aplicacion educativa para aprender SQL escribiendo consultas, ejecutandolas sobre una base temporal en memoria y viendo el orden logico de procesamiento.

Proyecto desarrollado por Prieto Agustin, alumno regular de Ingenieria en Sistemas de UTN-FRC.

## Instalacion

```bash
npm install
```

## Uso

```bash
npm run dev
```

Comandos disponibles:

- `npm run dev`: inicia el entorno local de desarrollo.
- `npm run build`: genera el build de produccion.
- `npm run preview`: sirve el build generado.
- `npm test`: ejecuta tests del motor, servicio de importacion y UI.
- `npm run test:engine`: ejecuta tests del motor SQL.
- `npm run test:service`: ejecuta tests del servicio de importacion.
- `npm run test:ui`: ejecuta tests de integracion UI con Vitest.

## Funcionalidades

- Editor SQL con ejemplos.
- Ejecucion de consultas sobre una base temporal en memoria.
- Visualizacion del recorrido logico de ejecucion.
- Modo completo y modo paso a paso.
- Sandbox para crear, modificar y eliminar tablas temporales.
- Importacion de archivos `.sql` y `.txt` con validacion de tamano y contenido.
- Historial de consultas y biblioteca de conceptos SQL.

## Limitaciones

- No hay backend ni persistencia: la base temporal se pierde al recargar la sesion.
- No busca compatibilidad completa con SQL Server; implementa un subconjunto educativo.
- La restauracion explicita de la base de ejemplo esta planificada como accion futura separada.

## Documentacion

- [Arquitectura](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)

ATENCION!!

Este proyecto fue desarrollado con el apoyo de herramientas de inteligencia artificial. Aunque el código fue revisado y probado durante el proceso, es posible que algunas secciones presenten diferencias de estilo, una complejidad mayor a la necesaria o decisiones técnicas que puedan mejorarse.

Los reportes de errores, vulnerabilidades y oportunidades de mejora son bienvenidos. Para contribuir, podés crear una rama con los cambios propuestos y abrir un pull request explicando brevemente el problema identificado y la solución implementada.

Cada aporte será revisado y considerado con atención.

Gracias por tu interés y por dedicar tiempo a explorar el proyecto.
