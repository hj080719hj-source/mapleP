let icons = [];
try {
  const response = await fetch(new URL('../assets/equipment-icons.json', import.meta.url));
  if (response.ok) icons = await response.json();
} catch { /* Names remain visible without icons. */ }
export function equipmentIcon(item) {
  // Nexon equipment icons served by mitemprice.kr, copied without modification.
  // Mitra (1190555) icon: maplestory.io GMS/255, original game asset.
  if (['original-sin','blood-wraith','mitra','michaela','genesis','dunwitch'].includes(item.id)) return `<img class="equipment-icon-image" src="./assets/${item.id}.png" alt="" width="24" height="24">`;
  const matches = icons.filter(i=>i.label===item.label && /^-?\d+px -?\d+px$/.test(i.position));
  return matches.length ? `<span class="equipment-icons" aria-hidden="true">${matches.map(i=>`<i style="background-position:${i.position};background-size:120px 168px"></i>`).join('')}</span>` : '<span aria-hidden="true">◇</span>';
}
