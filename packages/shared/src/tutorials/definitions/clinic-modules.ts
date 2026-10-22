import { buildStandardModuleTutorial } from './build-module-tutorial';
import type { TutorialDefinition } from '../types';

/**
 * Detailed continuous tutorials for clinic modules.
 * Each action maps to a real UI control via data-tour="{moduleId}-{actionId}".
 * Narration explains how to perform the action step by step.
 * Excludes Configuración, Tutoriales and Superadmin.
 */
export const CLINIC_MODULE_TUTORIALS: TutorialDefinition[] = [
  buildStandardModuleTutorial({
    moduleId: 'dashboard',
    startRoute: '/dashboard',
    titleName: 'Dashboard',
    description: 'Indicadores del día, acciones rápidas, sala de espera y actividad reciente.',
    actions: [
      {
        id: 'quick-actions',
        title: 'Acciones rápidas',
        body: '1) Ubicá la fila de acciones rápidas. 2) Tocá el botón de la operación que necesitás (consulta, paciente, receta, factura…). 3) Se abre el formulario listo para completar.',
        narration:
          'Acá están las acciones rápidas. Primero mirá los botones de esta fila. Después tocá el que necesitás: por ejemplo Nueva consulta, Nuevo paciente, Nueva receta o Nueva factura. Eso te lleva directo al formulario, sin pasar por el menú.',
        durationSec: 16,
      },
      {
        id: 'stats',
        title: 'Indicadores del día',
        body: '1) Revisá cada tarjeta de métrica. 2) Si una tarjeta es un enlace, tocála para ir al módulo. 3) Usá estos números para priorizar el día.',
        narration:
          'Estas tarjetas son los indicadores del día. Leé el número de cada una: citas, pacientes u otras métricas. Si la tarjeta es un enlace, tocála para abrir el módulo relacionado y profundizar.',
        durationSec: 15,
      },
      {
        id: 'waiting-room',
        title: 'Sala de espera del día',
        body: '1) Mirá el resumen de quién está en cola. 2) Tocá Gestionar para abrir Sala de espera completa. 3) Desde ahí operás check-in, llamados y atención.',
        narration:
          'Este bloque resume la sala de espera. Primero mirá quién está en cola. Si necesitás operar, tocá Gestionar: eso abre el módulo de Sala de espera para hacer check-in, llamar pacientes y seguir la atención.',
        durationSec: 16,
      },
      {
        id: 'activity',
        title: 'Actividad y recientes',
        body: '1) Bajá a la actividad reciente. 2) Tocá un paciente o propietario reciente para retomar. 3) Usalo como atajo al trabajo del día.',
        narration:
          'Más abajo está la actividad reciente. Revisá los movimientos del día y tocá un paciente o propietario reciente para abrir su ficha y retomar el trabajo sin buscarlo de cero.',
        durationSec: 15,
      },
    ],
  }),
  buildStandardModuleTutorial({
    moduleId: 'sala-espera',
    startRoute: '/sala-espera',
    titleName: 'Sala de espera',
    description: 'Cola operativa: superficies, tablero, check-in y seguimiento de atención.',
    actions: [
      {
        id: 'surfaces',
        title: 'Abrir superficies',
        body: '1) Arriba a la derecha están Tablero, Kiosco y Pantalla TV. 2) Tocá Tablero para operar. 3) Usá Kiosco o TV según recepción o sala.',
        narration:
          'Arriba a la derecha están las superficies. Tocá Tablero para la operación diaria. Tocá Kiosco si el tutor hace check-in solo. Tocá Pantalla TV para mostrar la cola en la sala. Cada botón abre su vista especializada.',
        durationSec: 17,
      },
      {
        id: 'ops',
        title: 'Resumen operativo',
        body: '1) Leé pendientes de check-in, en cola y tiempos. 2) Usá esos números para priorizar. 3) Si algo está alto, bajá al tablero a intervenir.',
        narration:
          'Este resumen operativo te muestra cuántos turnos faltan de check-in, cuántos están en cola y cómo vienen los tiempos de espera. Leélo primero. Si ves demoras, bajá al tablero y actuá sobre esos pacientes.',
        durationSec: 16,
      },
      {
        id: 'board',
        title: 'Gestionar la cola',
        body: '1) Encontrá al paciente en el tablero. 2) Usá Check-in, Llamar o En atención según el momento. 3) Completá el ciclo cuando termina la consulta.',
        narration:
          'En el tablero gestionás cada paciente paso a paso. Primero registrá el check-in cuando llega. Después llamalo a consultorio. Luego pasalo a en atención. Cuando termina, completá el ciclo. También podés filtrar o buscar si la cola es larga.',
        durationSec: 18,
      },
    ],
  }),
  buildStandardModuleTutorial({
    moduleId: 'pacientes',
    startRoute: '/pacientes',
    titleName: 'Pacientes',
    description: 'Buscar, filtrar, abrir fichas y dar de alta mascotas.',
    actions: [
      {
        id: 'search',
        title: 'Buscar paciente',
        body: '1) Hacé clic en el buscador. 2) Escribí nombre, microchip o propietario. 3) Esperá a que la lista se filtre sola.',
        narration:
          'Para buscar un paciente, tocá el campo de búsqueda. Escribí el nombre de la mascota, el microchip o el propietario. La lista se actualiza sola: no hace falta apretar Enter.',
        durationSec: 15,
      },
      {
        id: 'filter',
        title: 'Filtrar por especie',
        body: '1) Abrí el selector de especie. 2) Elegí canino, felino u otra. 3) La lista muestra solo esa categoría.',
        narration:
          'Para filtrar por especie, abrí el desplegable al lado del buscador. Elegí canino, felino u otra categoría. La tabla se achica a esa especie. Para volver a ver todos, elegí Todas las especies.',
        durationSec: 15,
      },
      {
        id: 'list',
        title: 'Abrir la ficha',
        body: '1) Encontrá al paciente en la tabla. 2) Tocá su nombre o la fila. 3) En la ficha usá historial e atajos clínicos.',
        narration:
          'Para abrir una ficha, tocá el nombre del paciente en la lista. Ahí ves datos, historial y atajos a internación, vacunas, laboratorio y más. En Tutoriales no se modifica ningún registro real.',
        durationSec: 16,
      },
      {
        id: 'new',
        title: 'Alta de paciente',
        body: '1) Tocá Nuevo paciente. 2) Completá datos de la mascota y el tutor. 3) Guardá. En la demo no se guarda nada real.',
        narration:
          'Para dar de alta una mascota tocá Nuevo paciente. Completá nombre, especie y el tutor. Revisá los datos y guardá. En Tutoriales no se crea ningún paciente real.',
        route: '/pacientes/nuevo',
        durationSec: 16,
      },
    ],
  }),
  buildStandardModuleTutorial({
    moduleId: 'propietarios',
    startRoute: '/propietarios',
    titleName: 'Propietarios',
    description: 'Buscar tutores, abrir fichas y registrar nuevos propietarios.',
    actions: [
      {
        id: 'search',
        title: 'Buscar tutor',
        body: '1) Tocá el buscador. 2) Escribí nombre o documento. 3) Revisá la lista filtrada.',
        narration:
          'Para encontrar un tutor, usá el buscador. Escribí el nombre o el documento. La lista se filtra al instante. Así ubicás al propietario aunque la clínica tenga muchos registros.',
        durationSec: 14,
      },
      {
        id: 'list',
        title: 'Abrir la ficha del tutor',
        body: '1) Tocá un propietario de la lista. 2) Revisá contacto y mascotas. 3) Desde ahí podés seguir a un paciente.',
        narration:
          'Tocá un propietario en la lista para abrir su ficha. Ahí ves teléfono, email, documento y las mascotas vinculadas. Desde esa ficha podés entrar a cada paciente asociado.',
        durationSec: 15,
      },
      {
        id: 'new',
        title: 'Alta de propietario',
        body: '1) Tocá Nuevo propietario. 2) Completá contacto y documento. 3) Guardá. En la demo no se guarda nada real.',
        narration:
          'Para registrar un tutor nuevo tocá Nuevo propietario. Completá nombre, teléfono, email y documento. Guardá cuando esté listo. En la demo no se modifica la base real.',
        route: '/propietarios/nuevo',
        durationSec: 15,
      },
    ],
  }),
  buildStandardModuleTutorial({
    moduleId: 'historia-clinica',
    startRoute: '/historia-clinica',
    titleName: 'Historia clínica',
    description: 'Buscar entradas, consultar evoluciones y crear nuevas notas clínicas.',
    actions: [
      {
        id: 'search',
        title: 'Buscar entradas',
        body: '1) Tocá el buscador. 2) Escribí paciente, diagnóstico o motivo. 3) Abrí la entrada que necesitás.',
        narration:
          'Para ubicar una evolución, usá el buscador. Escribí paciente, diagnóstico o motivo de consulta. La lista se filtra y podés abrir la entrada correcta más rápido.',
        durationSec: 15,
      },
      {
        id: 'list',
        title: 'Abrir una entrada',
        body: '1) Elegí una fila de la lista. 2) Tocá para ver el detalle. 3) Revisá motivo, hallazgos y evolución.',
        narration:
          'En la lista tocá una entrada. Se abre el detalle clínico: motivo, hallazgos y evolución. Usalo para revisar lo que ya se documentó del paciente.',
        durationSec: 14,
      },
      {
        id: 'new',
        title: 'Nueva entrada clínica',
        body: '1) Tocá Nueva entrada. 2) Elegí el paciente. 3) Completá la evolución y guardá. En Tutoriales no se guarda nada real.',
        narration:
          'Para documentar una atención tocá Nueva entrada. Elegí el paciente, completá motivo y evolución, y guardá. En la demo no se guarda ningún dato real.',
        route: '/historia-clinica/nuevo',
        durationSec: 16,
      },
    ],
  }),
  buildStandardModuleTutorial({
    moduleId: 'imagenes',
    startRoute: '/imagenes',
    titleName: 'Imágenes',
    description: 'Buscar estudios, revisar galería y cargar nuevas imágenes clínicas.',
    actions: [
      {
        id: 'search',
        title: 'Buscar estudios',
        body: '1) Usá el buscador. 2) Escribí paciente o título. 3) Opcional: filtrá por tipo de estudio.',
        narration:
          'Para encontrar un estudio, usá el buscador por paciente o título. También podés filtrar por tipo de imagen. Así achicás la galería a lo que necesitás ver.',
        durationSec: 15,
      },
      {
        id: 'list',
        title: 'Revisar la galería',
        body: '1) Mirá las miniaturas o filas. 2) Tocá un estudio. 3) Revisá la imagen con el contexto del paciente.',
        narration:
          'En la galería tocá un estudio para abrirlo. Vas a ver la imagen o documento con el paciente asociado. Así revisás radiografías, fotos o archivos clínicos.',
        durationSec: 15,
      },
      {
        id: 'new',
        title: 'Cargar imagen',
        body: '1) Tocá Subir o Nueva imagen. 2) Asociá el paciente. 3) Elegí el archivo y guardá. En la demo no se sube nada real.',
        narration:
          'Para cargar un estudio tocá Subir. Asociá el paciente, elegí el tipo y el archivo, y confirmá. En Tutoriales no se guarda ninguna imagen real.',
        route: '/imagenes/nueva',
        durationSec: 16,
      },
    ],
  }),
  buildStandardModuleTutorial({
    moduleId: 'consultas',
    startRoute: '/consultas',
    titleName: 'Consultas',
    description: 'Cola de atención, walk-in y seguimiento de consultas abiertas.',
    actions: [
      {
        id: 'queue',
        title: 'Cola de consultas',
        body: '1) Mirá la cola de hoy. 2) Identificá pendientes y completadas. 3) Elegí la consulta a retomar.',
        narration:
          'Esta es la cola de consultas del día. Arriba ves cuántas están pendientes y cuántas ya se completaron. Empezá por las pendientes para seguir la atención en curso.',
        durationSec: 15,
      },
      {
        id: 'list',
        title: 'Abrir una consulta',
        body: '1) Tocá una consulta de la cola. 2) Completá el SOAP si corresponde. 3) Usá atajos a internación, lab o farmacia.',
        narration:
          'Tocá una consulta de la lista para abrirla. Ahí completás el SOAP y podés disparar atajos a internación, laboratorio o farmacia según lo que necesite el paciente.',
        durationSec: 16,
      },
      {
        id: 'new',
        title: 'Iniciar walk-in',
        body: '1) Tocá Consulta walk-in o Nueva consulta. 2) Elegí paciente. 3) Iniciá la atención. En la demo no se guarda nada real.',
        narration:
          'Si llega alguien sin turno, tocá Consulta walk-in. Elegí el paciente e iniciá la atención. En Tutoriales no se crea ninguna consulta real.',
        route: '/consultas/nueva',
        durationSec: 15,
      },
    ],
  }),
  buildStandardModuleTutorial({
    moduleId: 'internacion',
    startRoute: '/internacion',
    titleName: 'Internación',
    description: 'Listar internados, abrir fichas y registrar ingresos.',
    actions: [
      {
        id: 'list',
        title: 'Pacientes internados',
        body: '1) Revisá el tablero de internados. 2) Mirá estado, jaula y motivo. 3) Tocá una tarjeta para abrir el detalle.',
        narration:
          'Acá ves quién está internado ahora. Cada tarjeta muestra paciente, estado, jaula y motivo. Revisá el tablero y tocá una tarjeta cuando quieras entrar al seguimiento.',
        durationSec: 15,
      },
      {
        id: 'detail',
        title: 'Seguimiento del internado',
        body: '1) Abrí un internado. 2) Revisá evolución y estado. 3) Usá las acciones de actualización o alta según corresponda.',
        narration:
          'Al abrir un internado ves el detalle hospitalario: estado, evolución y acciones. Desde ahí actualizás el seguimiento o gestionás el alta cuando corresponda.',
        durationSec: 16,
      },
      {
        id: 'new',
        title: 'Registrar ingreso',
        body: '1) Tocá Admitir. 2) Elegí paciente y motivo. 3) Confirmá el ingreso. En la demo no se guarda nada real.',
        narration:
          'Para internar un paciente tocá Admitir. Completá paciente, motivo y datos del ingreso, y confirmá. En Tutoriales no se modifica ningún internado real.',
        route: '/internacion/nueva',
        durationSec: 15,
      },
    ],
  }),
  buildStandardModuleTutorial({
    moduleId: 'vacunacion',
    startRoute: '/vacunacion',
    titleName: 'Vacunación',
    description: 'Vencimientos, historial de dosis y registro de nuevas aplicaciones.',
    actions: [
      {
        id: 'due',
        title: 'Refuerzos por vencer',
        body: '1) Revisá vencidas y por vencer. 2) Priorizá contactar al tutor. 3) Abrí el caso para registrar la dosis.',
        narration:
          'Este tablero muestra refuerzos vencidos o por vencer. Empezá por las vencidas. Usalo para priorizar el contacto con el tutor y después registrar la dosis cuando corresponda.',
        durationSec: 16,
      },
      {
        id: 'list',
        title: 'Historial de vacunas',
        body: '1) Bajá al historial. 2) Buscá si hace falta. 3) Tocá una dosis para ver detalle.',
        narration:
          'En el historial ves vacunas ya aplicadas. Podés buscar por paciente, vacuna o lote, y tocar una fila para ver la dosis completa.',
        durationSec: 14,
      },
      {
        id: 'new',
        title: 'Registrar dosis',
        body: '1) Tocá Registrar vacuna. 2) Elegí paciente y vacuna. 3) Guardá la aplicación. En la demo no se guarda nada real.',
        narration:
          'Para registrar una dosis tocá Registrar vacuna. Elegí paciente, vacuna y fecha, y guardá. En Tutoriales no se guarda ningún dato real.',
        route: '/vacunacion/nueva',
        durationSec: 15,
      },
    ],
  }),
  buildStandardModuleTutorial({
    moduleId: 'cirugias',
    startRoute: '/cirugias',
    titleName: 'Cirugías',
    description: 'Programar, listar y abrir el detalle de procedimientos quirúrgicos.',
    actions: [
      {
        id: 'list',
        title: 'Listado de cirugías',
        body: '1) Revisá el quirófano: programadas, en curso y recuperación. 2) Tocá una cirugía. 3) Seguí el estado del procedimiento.',
        narration:
          'En el listado de quirófano ves programadas, en curso y en recuperación. Tocá una cirugía para abrir el detalle y seguir el procedimiento.',
        durationSec: 15,
      },
      {
        id: 'search',
        title: 'Buscar cirugía',
        body: '1) En el historial usá el buscador. 2) Escribí paciente o procedimiento. 3) Abrí el resultado.',
        narration:
          'Si hay muchas cirugías, bajá al historial y usá el buscador. Escribí paciente o procedimiento hasta encontrar el caso, y abrilo.',
        durationSec: 14,
      },
      {
        id: 'new',
        title: 'Programar cirugía',
        body: '1) Tocá Programar. 2) Completá paciente y datos quirúrgicos. 3) Confirmá. En la demo no se guarda nada real.',
        narration:
          'Para programar un procedimiento tocá Programar. Completá paciente, tipo de cirugía y datos del quirófano, y confirmá. En la demo no se crea ninguna cirugía real.',
        route: '/cirugias/nueva',
        durationSec: 15,
      },
    ],
  }),
  buildStandardModuleTutorial({
    moduleId: 'laboratorio',
    startRoute: '/laboratorio',
    titleName: 'Laboratorio',
    description: 'Órdenes, resultados y alta de nuevos pedidos de laboratorio.',
    actions: [
      {
        id: 'list',
        title: 'Órdenes de laboratorio',
        body: '1) Revisá la cola: solicitadas y en proceso. 2) Tocá una orden. 3) Actualizá estado o cargá resultado.',
        narration:
          'Acá está la cola de laboratorio. Ves órdenes solicitadas y en proceso. Tocá una para ver el detalle, iniciar el estudio o cargar el resultado.',
        durationSec: 15,
      },
      {
        id: 'search',
        title: 'Buscar orden',
        body: '1) En el historial usá el buscador. 2) Filtrá por paciente o estado. 3) Abrí la orden.',
        narration:
          'En el historial buscá por paciente o estudio. También podés filtrar por estado. Así encontrás una orden específica entre muchos pedidos.',
        durationSec: 14,
      },
      {
        id: 'new',
        title: 'Nueva orden',
        body: '1) Tocá Nueva orden. 2) Asociá paciente y tipo de análisis. 3) Confirmá el pedido. En la demo no se guarda nada real.',
        narration:
          'Para pedir un estudio tocá Nueva orden. Asociá el paciente, elegí el análisis y confirmá. En Tutoriales no se crea ninguna orden real.',
        route: '/laboratorio/nueva',
        durationSec: 15,
      },
    ],
  }),
  buildStandardModuleTutorial({
    moduleId: 'inventario',
    startRoute: '/inventario',
    titleName: 'Inventario',
    description: 'Stock bajo, búsqueda de productos y alta de ítems.',
    actions: [
      {
        id: 'low-stock',
        title: 'Stock bajo',
        body: '1) Revisá el tablero de stock bajo. 2) Priorizá reposición. 3) Abrí el producto para ver existencias.',
        narration:
          'Este tablero muestra productos en o bajo el mínimo. Empezá por acá para priorizar la reposición. Tocá un producto si necesitás ver el detalle de stock.',
        durationSec: 15,
      },
      {
        id: 'search',
        title: 'Buscar producto',
        body: '1) En el catálogo usá el buscador. 2) Escribí nombre, SKU o fabricante. 3) Opcional: filtrá por categoría.',
        narration:
          'En el catálogo usá el buscador por nombre, SKU o fabricante. También podés filtrar por categoría. Así encontrás el ítem sin recorrer todo el depósito.',
        durationSec: 15,
      },
      {
        id: 'list',
        title: 'Abrir un producto',
        body: '1) Tocá un producto de la lista. 2) Revisá existencias y movimientos. 3) Ajustá stock si corresponde.',
        narration:
          'Tocá un producto del catálogo para abrir el detalle. Ahí ves existencias y movimientos. Desde el detalle podés seguir el historial de stock.',
        durationSec: 14,
      },
      {
        id: 'new',
        title: 'Nuevo producto',
        body: '1) Tocá Nuevo producto. 2) Completá nombre y datos de stock. 3) Guardá. En la demo no se guarda nada real.',
        narration:
          'Para dar de alta un ítem tocá Nuevo producto. Completá nombre, unidad, mínimos y stock inicial, y guardá. En la demo no se altera el inventario real.',
        route: '/inventario/nuevo',
        durationSec: 15,
      },
    ],
  }),
  buildStandardModuleTutorial({
    moduleId: 'farmacia',
    startRoute: '/farmacia',
    titleName: 'Farmacia',
    description: 'Recetas abiertas, historial y prescripción de medicamentos.',
    actions: [
      {
        id: 'board',
        title: 'Recetas abiertas',
        body: '1) Revisá recetas activas. 2) Tocá una para ver medicamentos. 3) Dispensá cuando corresponda.',
        narration:
          'En el tablero de recetas activas ves lo pendiente de dispensar. Tocá una receta para revisar medicamentos y continuar con la dispensa o el seguimiento.',
        durationSec: 15,
      },
      {
        id: 'search',
        title: 'Buscar en historial',
        body: '1) Bajá al historial. 2) Buscá por paciente, medicamento o número. 3) Abrí la receta.',
        narration:
          'En el historial usá el buscador por paciente, medicamento o número de receta. Así ubicás una prescripción anterior sin revisar toda la lista.',
        durationSec: 14,
      },
      {
        id: 'new',
        title: 'Nueva receta',
        body: '1) Tocá Nueva receta. 2) Elegí paciente y medicamentos. 3) Guardá. En la demo no se guarda nada real.',
        narration:
          'Para prescribir tocá Nueva receta. Elegí el paciente, cargá los medicamentos y confirmá. En Tutoriales no se guarda ninguna receta real.',
        route: '/farmacia/nueva',
        durationSec: 15,
      },
    ],
  }),
  buildStandardModuleTutorial({
    moduleId: 'facturacion',
    startRoute: '/facturacion',
    titleName: 'Facturación',
    description: 'Cuentas abiertas, historial de facturas y emisión de comprobantes.',
    actions: [
      {
        id: 'open',
        title: 'Cuentas abiertas',
        body: '1) Revisá cuentas por cobrar. 2) Tocá una factura pendiente. 3) Seguila hasta el cobro.',
        narration:
          'Acá ves las cuentas por cobrar. Revisá el saldo pendiente, tocá una factura y seguí el comprobante hasta emitir o cobrar según el caso.',
        durationSec: 15,
      },
      {
        id: 'search',
        title: 'Buscar factura',
        body: '1) En el historial usá el buscador. 2) Escribí número, propietario o paciente. 3) Abrí el comprobante.',
        narration:
          'En el historial buscá por número, propietario o paciente. Cuando aparezca la factura, abrila para revisar ítems, estado y saldo.',
        durationSec: 14,
      },
      {
        id: 'new',
        title: 'Nueva factura',
        body: '1) Tocá Nueva factura. 2) Asociá paciente o propietario e ítems. 3) Emití. En la demo no se emite nada real.',
        narration:
          'Para emitir un comprobante tocá Nueva factura. Asociá el paciente o propietario, cargá los ítems y confirmá. En la demo no se emite ninguna factura real.',
        route: '/facturacion/nueva',
        durationSec: 16,
      },
      {
        id: 'caja-link',
        title: 'Ir a Caja',
        body: '1) Tocá el botón Caja. 2) Registrá el cobro en el turno abierto. 3) Volvé a Facturación si necesitás seguir con comprobantes.',
        narration:
          'Si ya emitiste y necesitás cobrar, tocá Caja. Ahí registrás el movimiento de cobro vinculado a la facturación. Después podés volver a Facturación para seguir con otros comprobantes.',
        durationSec: 15,
      },
    ],
  }),
  buildStandardModuleTutorial({
    moduleId: 'caja',
    startRoute: '/caja',
    titleName: 'Caja',
    description: 'Movimientos del día, detalle de cobros y egresos.',
    actions: [
      {
        id: 'list',
        title: 'Movimientos de caja',
        body: '1) Revisá el turno abierto y los movimientos. 2) Identificá cobros y egresos. 3) Tocá un movimiento o sesión para ver detalle.',
        narration:
          'En Caja ves el turno abierto y los movimientos. Identificá cobros y egresos del día. Tocá un movimiento o una sesión del historial cuando necesites el detalle.',
        durationSec: 16,
      },
      {
        id: 'search',
        title: 'Buscar movimiento',
        body: '1) En el historial filtrá por estado. 2) Abrí la sesión que buscás. 3) Revisá montos y diferencias.',
        narration:
          'En el historial de cajas filtrá por estado abierto o cerrado. Abrí la sesión que necesitás para revisar montos, fondo y diferencias.',
        durationSec: 14,
      },
      {
        id: 'detail',
        title: 'Detalle del movimiento',
        body: '1) Abrí una sesión o movimiento. 2) Revisá monto, medio y referencia. 3) Usalo para conciliar o auditar el cobro.',
        narration:
          'Al abrir el detalle ves monto, medio de pago y referencia. Usalo para conciliar o entender de dónde salió cada cobro o egreso.',
        durationSec: 15,
      },
    ],
  }),
  buildStandardModuleTutorial({
    moduleId: 'reportes',
    startRoute: '/reportes',
    titleName: 'Reportes',
    description: 'Elegir período, leer indicadores y revisar operación e inventario.',
    actions: [
      {
        id: 'period',
        title: 'Elegir período',
        body: '1) Elegí un preset o fechas Desde/Hasta. 2) Aplicá el rango. 3) Esperá que se recalculen los indicadores.',
        narration:
          'Primero elegí el período. Podés usar un preset o cargar Desde y Hasta, y aplicar. Eso recalcula todos los indicadores del reporte.',
        durationSec: 15,
      },
      {
        id: 'stats',
        title: 'Leer indicadores',
        body: '1) Recorré las tarjetas de cada sección. 2) Compará operación, caja e inventario. 3) Detectá desvíos del período.',
        narration:
          'Después leé las tarjetas: pacientes, citas, caja e inventario del período. Cada número te ayuda a ver cómo operó la clínica en ese rango.',
        durationSec: 15,
      },
      {
        id: 'sections',
        title: 'Secciones del reporte',
        body: '1) Bajá por operación, facturación e inventario. 2) Abrí desgloses si hace falta. 3) Exportá sala de espera si lo necesitás.',
        narration:
          'El reporte se organiza por secciones. Recorré operación, facturación e inventario. En cada bloque podés ver desgloses y, si corresponde, exportar datos de sala de espera.',
        durationSec: 16,
      },
    ],
  }),
  buildStandardModuleTutorial({
    moduleId: 'auditoria',
    startRoute: '/auditoria',
    titleName: 'Auditoría',
    description: 'Buscar eventos, filtrar trazas y abrir el detalle de una acción.',
    actions: [
      {
        id: 'search',
        title: 'Buscar eventos',
        body: '1) Usá el buscador por usuario, entidad o nombre. 2) Filtrá por acción o fechas. 3) Achicá la lista a lo relevante.',
        narration:
          'Para encontrar una traza usá el buscador por usuario, entidad o nombre. También podés filtrar por tipo de acción y fechas. Así achicás el listado a lo que importa.',
        durationSec: 16,
      },
      {
        id: 'list',
        title: 'Listado de trazas',
        body: '1) Revisá quién hizo qué y cuándo. 2) Identificá el evento. 3) Tocá la fila para el detalle.',
        narration:
          'El listado muestra cada acción auditada: quién, qué y cuándo. Escaneá las filas y tocá la que necesitás investigar.',
        durationSec: 14,
      },
      {
        id: 'detail',
        title: 'Abrir detalle',
        body: '1) Tocá un evento. 2) Revisá el resumen y metadatos. 3) Usalo para controlar cambios o accesos.',
        narration:
          'Al tocar un evento abrís el detalle completo de la traza. Revisá el resumen y los datos asociados para controlar cambios o accesos relevantes.',
        durationSec: 15,
      },
    ],
  }),
  buildStandardModuleTutorial({
    moduleId: 'whatsapp',
    startRoute: '/whatsapp',
    titleName: 'WhatsApp',
    description: 'Historial de mensajes, búsqueda y composición de nuevos avisos.',
    actions: [
      {
        id: 'search',
        title: 'Buscar conversaciones',
        body: '1) Tocá el buscador del historial. 2) Escribí tutor, teléfono o texto. 3) Revisá los resultados.',
        narration:
          'En el historial usá el buscador por tutor, teléfono o texto del mensaje. Así encontrás un envío anterior sin recorrer toda la lista.',
        durationSec: 14,
      },
      {
        id: 'list',
        title: 'Historial de mensajes',
        body: '1) Revisá envíos recientes. 2) Mirá plantilla, paciente y estado. 3) Usalo para seguimiento con tutores.',
        narration:
          'El historial muestra los mensajes abiertos a WhatsApp: tutor, plantilla, teléfono y fecha. Usalo para hacer seguimiento de la comunicación.',
        durationSec: 14,
      },
      {
        id: 'compose',
        title: 'Nuevo mensaje',
        body: '1) Completá el formulario Nuevo mensaje. 2) Elegí tutor y plantilla. 3) Abrí WhatsApp. En Tutoriales no se envía nada real sin tu confirmación.',
        narration:
          'Para avisar a un tutor usá Nuevo mensaje. Elegí el destinatario, la plantilla y revisá el texto. Al confirmar se abre WhatsApp con el mensaje listo. En la demo no se envía nada automático a un tutor real.',
        durationSec: 17,
      },
    ],
  }),
  buildStandardModuleTutorial({
    moduleId: 'recordatorios',
    startRoute: '/recordatorios',
    titleName: 'Recordatorios',
    description: 'Revisar avisos programados, estados y seguimiento.',
    actions: [
      {
        id: 'list',
        title: 'Listado de recordatorios',
        body: '1) Revisá las tres columnas: citas, vacunas y facturas. 2) Identificá pendientes. 3) Elegí uno para actuar.',
        narration:
          'El tablero tiene tres columnas: citas, vacunas y facturas. Revisá cuántos avisos hay en cada una y elegí el pendiente que vas a gestionar.',
        durationSec: 15,
      },
      {
        id: 'detail',
        title: 'Detalle del aviso',
        body: '1) Tocá el paciente o título del aviso. 2) Revisá canal y vencimiento. 3) Decidí enviar o omitir.',
        narration:
          'En cada aviso ves paciente, tutor y vencimiento. Tocá el enlace para ir al registro relacionado, o usá WhatsApp u Omitir según corresponda.',
        durationSec: 15,
      },
      {
        id: 'status',
        title: 'Interpretar estados',
        body: '1) Mirá etiquetas de vencido o por vencer. 2) Priorizá los vencidos. 3) Reintentá si un envío falló.',
        narration:
          'Prestá atención a los estados: vencido, por vencer o pendiente. Priorizá los vencidos y revisá si hace falta reintentar un aviso que no salió.',
        durationSec: 14,
      },
    ],
  }),
  buildStandardModuleTutorial({
    moduleId: 'notificaciones',
    startRoute: '/notificaciones',
    titleName: 'Notificaciones',
    description: 'Bandeja interna: buscar, leer y gestionar avisos del equipo.',
    actions: [
      {
        id: 'search',
        title: 'Buscar avisos',
        body: '1) Tocá el buscador de la bandeja. 2) Escribí parte del título. 3) Abrí el aviso filtrado.',
        narration:
          'En la bandeja usá el buscador por título. Escribí unas letras del aviso que buscás y abrilo cuando aparezca en la lista.',
        durationSec: 13,
      },
      {
        id: 'list',
        title: 'Bandeja de entrada',
        body: '1) Revisá avisos nuevos y leídos. 2) Identificá lo pendiente del equipo. 3) Tocá uno para leerlo.',
        narration:
          'La bandeja muestra notificaciones internas. Las nuevas aparecen destacadas. Escaneá la lista y tocá la que necesitás leer.',
        durationSec: 14,
      },
      {
        id: 'read',
        title: 'Marcar o abrir',
        body: '1) Abrí la notificación. 2) Leé el detalle. 3) Marcala como gestionada según el flujo del equipo.',
        narration:
          'Tocá una notificación para leer el detalle. Después gestioná su estado de lectura según el flujo de tu equipo, para que no quede pendiente.',
        durationSec: 14,
      },
    ],
  }),
  buildStandardModuleTutorial({
    moduleId: 'ia-clinica',
    startRoute: '/ia-clinica',
    titleName: 'IA clínica',
    description: 'Generar sugerencias de apoyo y revisar resultados bajo supervisión.',
    actions: [
      {
        id: 'form',
        title: 'Nueva sugerencia',
        body: '1) Elegí el paciente. 2) Seleccioná el tipo de sugerencia. 3) Completá el contexto clínico si hace falta.',
        narration:
          'En Nueva sugerencia primero elegí el paciente. Después seleccioná el tipo de apoyo: resumen, SOAP u otro. Completá el contexto clínico que quieras que la IA considere.',
        durationSec: 16,
      },
      {
        id: 'generate',
        title: 'Generar apoyo',
        body: '1) Revisá el formulario. 2) Tocá Generar. 3) Esperá la respuesta. La IA no reemplaza tu criterio.',
        narration:
          'Cuando el formulario está listo, tocá Generar. Esperá la respuesta de asistencia. Recordá: la IA solo apoya; la decisión clínica es tuya.',
        durationSec: 15,
      },
      {
        id: 'review',
        title: 'Revisar resultado',
        body: '1) Leé el resultado o el historial. 2) Editá o descartá lo que no sirva. 3) Usalo solo como apoyo supervisado.',
        narration:
          'Revisá siempre el resultado en pantalla o en el historial. Editá o descartá lo que no aplique. La sugerencia es apoyo: no la uses sin supervisión profesional.',
        durationSec: 16,
      },
    ],
  }),
];
