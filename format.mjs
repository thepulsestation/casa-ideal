// Explicit grouping also separates four-digit amounts: 3.000,00 €.
export const euro=(n,d=0)=>n==null||!Number.isFinite(n)?'Pendiente':new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',useGrouping:'always',minimumFractionDigits:d,maximumFractionDigits:d}).format(n);
export const num=(n,d=2)=>new Intl.NumberFormat('es-ES',{useGrouping:'always',maximumFractionDigits:d}).format(n??0);
