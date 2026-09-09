"use strict";
/**
 * @fileoverview Rotación de formatos y temas para el agente de contenido.
 * Formato fijo por día (coincide con el calendario ya acordado), tema rotativo
 * sobre la lista de tendencias del negocio.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TREND_TOPICS = exports.WEEK_FORMATS = void 0;
exports.WEEK_FORMATS = [
    {
        day: "Lunes",
        key: "propio",
        label: "Duda de síntoma propio",
        hookExample: "¿Te ha dolido la cabeza así, todos los días, a la misma hora?",
        feature: "Invitación directa a escribir por mensaje para activar el mini-diagnóstico gratuito.",
    },
    {
        day: "Miércoles",
        key: "familiar",
        label: "Cuidado de un familiar",
        hookExample: "Mi mamá tiene diabetes y no sé si esa herida en el pie es grave o no.",
        feature: "Evaluación de lesiones por foto — pensado para quien cuida a otros.",
    },
    {
        day: "Viernes",
        key: "ajeno",
        label: "Curiosidad por diagnóstico ajeno",
        hookExample: "Le diagnosticaron algo con nombre raro a un conocido y quedaste con dudas.",
        feature: "Función educativa de la app, sin necesidad de ser paciente.",
    },
];
exports.TREND_TOPICS = [
    "Mito del 'Oz-zempic de presupuesto' (oat-zempic)",
    "Dry scooping (riesgos respiratorios de tomar proteína en polvo seca)",
    "Mouth taping y apnea del sueño",
    "Dato: 1 de cada 5 personas decide su salud por redes sociales",
    "Trivialización de la salud mental en redes",
    "Medicina P4 (predictiva, preventiva, personalizada, participativa)",
    "Estrés crónico y su efecto en el sistema inmune",
    "Soledad como factor de riesgo comparable al cigarrillo",
    "Cuidado de heridas y lesiones en pacientes diabéticos",
    "Doctor Google vs. doctor real",
];
//# sourceMappingURL=topics.js.map