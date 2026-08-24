import React from 'react';
import { SUBQUERY_STEP_TYPE } from '../../visual/visualSteps';
import { ExplanationEmptyState } from './ExplanationEmptyState';
import { ExplanationHeader } from './ExplanationHeader';

const explanationFor = (type) =>
  ({
    FROM: 'El motor localiza la fuente y crea el conjunto inicial.',
    JOIN: 'Compara la condición ON fila por fila y combina coincidencias.',
    WHERE:
      'Evalúa la condición externa para cada fila; si depende de una subconsulta, su resultado se obtiene en el paso siguiente.',
    [SUBQUERY_STEP_TYPE]:
      'Ejecuta la consulta interna y devuelve un valor, conjunto o veredicto que la cláusula externa usa para decidir qué filas continúan.',
    'GROUP BY': 'Construye una colección por cada combinación única de claves.',
    HAVING: 'Evalúa agregados de cada grupo y descarta los que no cumplen.',
    SELECT: 'Calcula expresiones y proyecta únicamente las columnas pedidas.',
    DISTINCT: 'Elimina filas duplicadas del resultado ya proyectado.',
    'ORDER BY': 'Compara valores y reordena el conjunto ya proyectado.',
    UNION: 'Combina dos resultados union-compatible y elimina duplicados.',
    INTERSECT: 'Conserva solo las filas que aparecen en ambos resultados.',
    EXCEPT: 'Conserva filas de la primera consulta que no aparecen en la segunda.',
    VALUES: 'Relaciona cada valor con su columna por posición.',
    SET: 'Asigna los nuevos valores en las filas seleccionadas.',
  })[type] || 'El motor valida la instrucción y aplica la transformación sobre el estado temporal.';
const exampleFor = (type) =>
  ({
    FROM: 'FROM Products',
    SOURCE: 'LEFT JOIN Orders o ON ...',
    JOIN: 'INNER JOIN Orders o ON c.id = o.customer_id',
    WHERE: 'WHERE YEAR(order_date) = 2026',
    [SUBQUERY_STEP_TYPE]: 'SELECT ... FROM ... WHERE columna = valor_externo',
    'GROUP BY': 'GROUP BY category_id',
    HAVING: 'HAVING COUNT(*) >= 2',
    SELECT: 'SELECT name, AVG(price)',
    DISTINCT: 'SELECT DISTINCT city',
    'ORDER BY': 'ORDER BY price DESC',
    UNION: 'SELECT city FROM Customers UNION SELECT city FROM Stores',
    INTERSECT: 'SELECT Dni FROM Empleados INTERSECT SELECT Dni FROM Jefes',
    EXCEPT: 'SELECT Dni FROM Empleados EXCEPT SELECT Dni FROM Jefes',
    LIMIT: 'OFFSET 5 ROWS FETCH NEXT 10 ROWS ONLY',
    VALUES: "VALUES (4, 'Books')",
    SET: 'SET stock = stock + 1',
    INSERT: 'INSERT INTO Categories (...)',
    UPDATE: 'UPDATE Products SET ...',
    DELETE: 'DELETE FROM Orders WHERE ...',
    PARSE: 'CREATE TABLE Suppliers (...)',
  })[type] || `${type} ...`;
const stepModeGuide = (step) =>
  ({
    FROM: 'Este paso muestra la tabla o conjunto inicial antes de aplicar filtros. Si faltan filas acá, el problema suele estar en el nombre de la tabla o en el origen elegido.',
    SOURCE:
      'Este paso prepara la fuente de datos declarada en la sentencia. Revisá que la tabla exista y que sus columnas coincidan con las que vas a usar después.',
    JOIN: 'Este paso combina tablas. Si aparecen NULL o faltan filas, revisá la condición ON y que estés comparando las claves correctas.',
    WHERE:
      'Este paso decide fila por fila qué registros continúan. Las filas marcadas como recortadas no cumplen la condición, por eso ya no llegan a SELECT, GROUP BY u ORDER BY.',
    'GROUP BY':
      'Este paso junta filas que comparten el mismo valor de agrupación. Si el resultado tiene menos filas que antes, no es un error: ahora cada fila representa un grupo.',
    HAVING:
      'Este paso filtra grupos ya calculados. A diferencia de WHERE, acá sí se pueden usar agregados como COUNT, SUM o AVG.',
    SELECT:
      'Este paso arma las columnas finales. Si una columna desaparece, es porque no fue seleccionada o quedó reemplazada por una expresión o alias.',
    DISTINCT:
      'Este paso elimina filas repetidas después de resolver SELECT. Si baja la cantidad de filas, significa que había resultados idénticos.',
    'ORDER BY':
      'Este paso solo reordena el resultado. No debería cambiar la cantidad de filas; si cambia, el problema viene de una etapa anterior.',
    VALUES:
      'Este paso toma los valores escritos y los ubica por posición en las columnas del INSERT.',
    SET: 'Este paso calcula los nuevos valores del UPDATE para las filas que pasaron el WHERE.',
    INSERT:
      'Este paso inserta registros en la tabla destino respetando columnas, tipos y restricciones.',
    UPDATE:
      'Este paso modifica únicamente las filas alcanzadas por el WHERE. Si se actualizan demasiadas, revisá el filtro.',
    DELETE:
      'Este paso elimina únicamente las filas alcanzadas por el WHERE. Si se eliminan demasiadas, el filtro es demasiado amplio.',
  })[step.type] ||
  'En este paso el motor valida o transforma la sentencia. Compará las filas visibles con lo que esperabas obtener en esta etapa.';
const stepDebugHint = (step) =>
  ['UNION', 'INTERSECT', 'EXCEPT'].includes(step.type)
    ? 'Si este resultado no coincide con lo esperado, revisá primero que ambos SELECT devuelvan la misma cantidad de columnas y tipos compatibles en el mismo orden.'
    : step.compare?.subquerySteps?.length
      ? 'La subconsulta se ejecuta como un recorrido interno: primero se obtiene su resultado y luego ese valor o conjunto se usa para evaluar la condición externa.'
      : step.compare?.kind === 'filter'
        ? 'Usá las filas recortadas como pista: compará sus valores con la condición escrita para entender por qué quedaron afuera.'
        : step.compare?.kind === 'project'
          ? 'Las columnas recortadas no se perdieron por error: SELECT define qué columnas quedan visibles en la salida.'
          : step.compare?.kind === 'join'
            ? 'Las columnas agregadas vienen de la tabla unida; el punto de unión ayuda a verificar si la relación FK = PK fue correcta.'
            : 'Si este paso no coincide con lo esperado, avanzá o retrocedé una etapa para ubicar exactamente dónde cambió el conjunto de datos.';
const noteFor = (type) =>
  type === 'LIMIT'
    ? 'SQL Server usa TOP o OFFSET ... FETCH en lugar de LIMIT.'
    : ['UNION', 'INTERSECT', 'EXCEPT'].includes(type)
      ? 'Los operadores de conjuntos se aplican despues de resolver cada SELECT individual.'
      : type === 'WHERE'
        ? 'WHERE no filtra agregados; para eso se usa HAVING.'
        : type === 'SELECT'
          ? 'Aunque se escribe primero, SELECT se resuelve después de FROM, WHERE y GROUP BY.'
          : type === 'DISTINCT'
            ? 'DISTINCT se aplica despues de construir la lista SELECT y antes del ordenamiento final.'
            : 'La simulación sigue el orden lógico, que puede diferir del orden escrito.';

const guideForStep = (step) =>
  step.type === SUBQUERY_STEP_TYPE
    ? 'Este paso abre la consulta interna. Si es correlacionada, revisá cada iteración: la fila externa inyecta un valor y la subconsulta devuelve un resultado para esa fila.'
    : stepModeGuide(step);
const debugHintForStep = (step) =>
  step.type === SUBQUERY_STEP_TYPE
    ? 'El resultado de este paso no es la salida final: vuelve a la condición externa para decidir si cada fila continúa.'
    : step.compare?.subquerySteps?.length
      ? 'La condición depende del resultado de una subconsulta; avanzá al paso siguiente para ver cómo se obtiene.'
      : stepDebugHint(step);
const noteForStep = (type) =>
  type === SUBQUERY_STEP_TYPE
    ? 'Las subconsultas de esta cátedra se evalúan desde WHERE o HAVING; su resultado alimenta la condición principal.'
    : noteFor(type);

function ExplanationSection({ title, children }) {
  return (
    <div className="explain-block">
      <h4>{title}</h4>
      {children}
    </div>
  );
}

export function ExplanationPanel({ visualSteps, activeStep, stepMode, open, onClose }) {
  const current = visualSteps[activeStep]?.item;
  return (
    <aside id="guia-contextual" className={`explain-panel ${open ? 'open' : ''}`}>
      <ExplanationHeader onClose={onClose} />
      {current ? (
        <div className="explanation">
          <span className={`large-chip accent-${current.accent}`}>{current.type}</span>
          <h2>{current.title}</h2>
          <ExplanationSection title="Qué hace esta cláusula">
            <p>{current.detail}</p>
          </ExplanationSection>
          <ExplanationSection title="Cómo se ejecuta">
            <p>{explanationFor(current.type)}</p>
          </ExplanationSection>
          {stepMode && (
            <div className="step-insight">
              <strong>Lectura del paso</strong>
              <p>{guideForStep(current)}</p>
              <p>{debugHintForStep(current)}</p>
            </div>
          )}
          <ExplanationSection title="Ejemplo">
            <code className="inline-example">{exampleFor(current.type)}</code>
          </ExplanationSection>
          <div className="metric">
            <span>Resultado intermedio</span>
            <strong>{current.count}</strong>
            <small>{current.count === 1 ? 'fila disponible' : 'filas disponibles'}</small>
          </div>
          <div className="tip">
            <strong>Notas</strong>
            <p>{noteForStep(current.type)}</p>
          </div>
        </div>
      ) : (
        <ExplanationEmptyState />
      )}
    </aside>
  );
}
