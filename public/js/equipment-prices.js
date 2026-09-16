// STARFORCE.GG /ev default basePrice values, checked 2026-09-16.
// Snapshot defaults in 100 million mesos, not live market quotes.
export const PRICE_SOURCE='https://starforce.gg/ev';
export const PRICE_DATE='2026-09-16';
export const EQUIPMENT_PRICES=Object.freeze({
  meister:.8, daybreak:.2, angel:.2, loose:15, eyepatch:40, pain:60,
  arcane:0, dreamy:40, command:20, terror:50, complete:200, astra:10,
  'eternal-main':.2, 'eternal-extra':10, destiny:100,
  whisper:500, oath:700, nightmare:500, 'original-sin':5000, 'blood-wraith':1800,
});
export const defaultEquipmentPrice=id=>EQUIPMENT_PRICES[id] ?? 0;
