# SQL Tutor Roadmap

## Trabajo reciente completado

- Documentacion de arquitectura vigente en `docs/ARCHITECTURE.md`.
- Tests UI basicos con Vitest, jsdom y Testing Library.
- Accesibilidad de overlays bloqueantes con foco inicial, focus trap, Escape y retorno de foco.
- Importacion SQL robusta para `.sql` y `.txt`, con limite de 1 MB, validacion de contenido vacio, BOM inicial y reutilizacion del input.

## Próximas mejoras

### Restaurar base de ejemplo

- Agregar una acción independiente llamada “Restaurar base de ejemplo”.
- No debe compartir comportamiento con el botón para limpiar el editor.
- Debe advertir que se eliminarán las tablas y registros temporales.
- Debe solicitar confirmación antes de ejecutar la restauración.
- Debe llamar a `createSeedDatabase()` solamente después de la confirmación.
- Debe limpiar la ejecución visual incompatible con la nueva base.
- No debe modificar las preferencias visuales del usuario.
- No debe eliminar el historial salvo que se decida expresamente.

Estado: pendiente.
Prioridad: media.

### Documentación de usuario en /docs

- Agregar documentacion orientada a usuarios sobre uso, ejemplos, motor SQL local y limites pedagogicos.
- Mantener la documentacion tecnica actual en `ARCHITECTURE.md` sin duplicarla.
- Evaluar Router solamente cuando exista una primera pagina real que lo justifique.

Estado: pendiente.
Prioridad: media.

### Página /about

- Crear una página informativa con objetivos del proyecto, contexto educativo y alcance.

Estado: pendiente.
Prioridad: baja.

### Página /limitations

- Explicar de forma clara qué SQL se soporta, qué casos son simulados y qué queda fuera del alcance actual.

Estado: pendiente.
Prioridad: media.

### Ruta de aprendizaje

- Definir una secuencia guiada de contenidos para aprender consultas SQL progresivamente.

Estado: pendiente.
Prioridad: alta.

### Ejercicios

- Agregar prácticas con consignas, datos iniciales y resultados esperados.

Estado: pendiente.
Prioridad: alta.

### Pistas y correcciones pedagógicas

- Incorporar ayudas graduadas y devoluciones orientadas a conceptos, no solo a errores técnicos.

Estado: pendiente.
Prioridad: alta.

### Mejora detallada de errores

- Enriquecer mensajes con ubicación probable, explicación de causa y sugerencias de corrección.

Estado: pendiente.
Prioridad: alta.

### Persistencia opcional de espacios de trabajo

- Permitir guardar y recuperar bases temporales, consultas y configuraciones locales cuando el usuario lo decida.

Estado: pendiente.
Prioridad: media.

### Usuarios y progreso

- Evaluar cuentas, progreso individual y continuidad entre sesiones únicamente en una etapa futura.

Estado: pendiente.
Prioridad: baja.

### Estadísticas para docentes

- Diseñar métricas agregadas sobre ejercicios, errores frecuentes y avance de grupos.

Estado: pendiente.
Prioridad: baja.

### Funcionamiento offline

- Asegurar que la experiencia principal pueda usarse sin conexión cuando los recursos estén cacheados.

Estado: pendiente.
Prioridad: media.
