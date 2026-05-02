// Contextual help content rendered by HelpFab.
// Keys are matched against pathname prefixes (longest match wins).

export interface HelpSection {
  title: string;
  body: string[]; // each entry is a paragraph (or "- " bullet line)
}

export interface HelpEntry {
  title: string;
  intro: string;
  sections: HelpSection[];
  tip?: string;
}

const help: Record<string, HelpEntry> = {
  "/dashboard/templates": {
    title: "Plantillas de facturas",
    intro: "Las plantillas definen tus facturas recurrentes (arriendo, internet, suscripciones).",
    sections: [
      {
        title: "Cómo funciona",
        body: [
          "Cada plantilla genera automáticamente una factura cada mes (o el ciclo que definas).",
          "El día de vencimiento y el monto estimado se usan para calcular las próximas facturas.",
          "Si pausas una plantilla deja de generar nuevas facturas, pero las existentes se conservan.",
        ],
      },
      {
        title: "Acciones",
        body: [
          "- Crear: define nombre, categoría, monto estimado, día de vencimiento y recurrencia.",
          "- Editar: ajusta el monto si tu factura subió.",
          "- Eliminar: borra la plantilla y todas sus facturas no pagadas.",
        ],
      },
    ],
    tip: "Si una factura llega en otro mes, créala manualmente desde Facturas en lugar de cambiar la plantilla.",
  },
  "/dashboard/payments": {
    title: "Pagos",
    intro: "Aquí ves el historial de pagos realizados y puedes registrar nuevos.",
    sections: [
      {
        title: "Registrar un pago",
        body: [
          "Desde el dashboard o la lista de facturas, presiona Pagar.",
          "Ingresa el monto, fecha y método. Puedes adjuntar el comprobante (foto o PDF).",
          "Si pagas en partes, registra varios pagos sobre la misma factura hasta cubrir el total.",
        ],
      },
      {
        title: "Reversar un pago",
        body: [
          "Si registraste un pago por error, ábrelo y usa Reversar.",
          "La factura vuelve a estado pendiente.",
        ],
      },
    ],
    tip: "Los comprobantes se guardan cifrados y solo tú los puedes ver.",
  },
  "/dashboard/income": {
    title: "Ingresos",
    intro: "Define tus fuentes de ingreso (salario, arriendos, freelance) y registra lo que efectivamente recibes cada mes.",
    sections: [
      {
        title: "Fuentes vs entradas",
        body: [
          "- Fuente: la plantilla recurrente (ej. 'Salario Acme', día 15, $X).",
          "- Entrada: la instancia de un mes específico, que puedes confirmar con el monto real.",
        ],
      },
      {
        title: "Ingresos variables",
        body: [
          "Si tu ingreso cambia mes a mes, deja el monto estimado y luego confirma con el valor real cuando lo recibas.",
          "Puedes agregar ingresos puntuales (no recurrentes) como bonos.",
        ],
      },
    ],
  },
  "/dashboard/reports": {
    title: "Reportes",
    intro: "Análisis de tus gastos: tendencia mensual, comparación con presupuesto y distribución por categoría.",
    sections: [
      {
        title: "Qué encontrarás",
        body: [
          "- Tendencia de los últimos meses.",
          "- Presupuesto vs ejecutado por categoría.",
          "- Distribución de gastos en el periodo seleccionado.",
        ],
      },
    ],
    tip: "Las cifras se basan en pagos confirmados; las facturas pendientes no cuentan como gasto.",
  },
  "/dashboard/settings": {
    title: "Ajustes",
    intro: "Configura notificaciones, presupuestos por categoría y el día de inicio de tu ciclo de pago.",
    sections: [
      {
        title: "Notificaciones",
        body: [
          "Email y Telegram: configura el remitente y el chat para recibir recordatorios.",
          "Hora del envío: define a qué hora del día corre el job de recordatorios.",
          "Reglas por plantilla: define cuántos días antes recibir recordatorio y si quieres alertas diarias por mora.",
        ],
      },
      {
        title: "Ciclo de pago",
        body: [
          "Si tu mes financiero no es del 1 al 30 (ej. tu salario llega el 15), define el día de inicio del ciclo.",
          "El dashboard agrupará facturas e ingresos por ese ciclo.",
        ],
      },
    ],
  },
  "/dashboard/profile": {
    title: "Mi perfil",
    intro: "Tus datos personales, contraseña y dispositivos con biometría.",
    sections: [
      {
        title: "Biometría / Passkey",
        body: [
          "Activa el Face ID o huella en este dispositivo para entrar sin contraseña.",
          "Puedes registrar varios dispositivos. Si pierdes uno, elimínalo desde aquí.",
        ],
      },
    ],
  },
  "/dashboard/admin": {
    title: "Administración",
    intro: "Gestión de usuarios y mantenimiento del sistema (solo administradores).",
    sections: [
      {
        title: "Usuarios",
        body: [
          "Aprueba o rechaza solicitudes de registro.",
          "Cambia roles (admin/user) o desactiva cuentas.",
        ],
      },
      {
        title: "Mantenimiento",
        body: [
          "Purga mes: elimina todas las facturas y pagos de un mes específico (irreversible).",
          "Úsalo solo si necesitas regenerar desde plantillas.",
        ],
      },
    ],
  },
  "/dashboard": {
    title: "Dashboard",
    intro: "Tu pantalla principal: estado del mes, qué falta por pagar y semáforo de facturas.",
    sections: [
      {
        title: "Qué muestra",
        body: [
          "- Hero: total pendiente y proyección del ciclo actual.",
          "- Vencidas: facturas que ya pasaron su fecha y no han sido pagadas.",
          "- Próximas: facturas que vencen en los próximos días.",
          "- Fuera del ciclo: facturas que vencen después del cierre del ciclo actual.",
        ],
      },
      {
        title: "Acciones rápidas",
        body: [
          "Toca el botón Pagar de cualquier factura para registrar el pago al instante.",
          "Toca el nombre de la factura para ver detalles e historial.",
        ],
      },
    ],
    tip: "Si no ves facturas, ve a Plantillas y crea al menos una. El sistema generará las del mes automáticamente.",
  },
};

export function getHelpFor(pathname: string): HelpEntry {
  // longest matching prefix wins
  const keys = Object.keys(help).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (pathname.startsWith(key)) return help[key];
  }
  return help["/dashboard"];
}
