export async function extractGpsFromFile(file: File): Promise<[number, number] | null> {
  try {
    const buf = await file.slice(0, 128 * 1024).arrayBuffer();
    const view = new DataView(buf);
    if (view.getUint16(0) !== 0xFFD8) return null;

    let offset = 2;
    while (offset < view.byteLength - 4) {
      const marker = view.getUint16(offset);
      if (marker === 0xFFE1) {
        const exifOffset = offset + 4;
        if (view.getUint32(exifOffset) !== 0x45786966) break;
        const tiffStart = exifOffset + 6;
        const le = view.getUint16(tiffStart) === 0x4949;
        const g16 = (o: number) => view.getUint16(o, le);
        const g32 = (o: number) => view.getUint32(o, le);
        const readRational = (o: number) => g32(o) / g32(o + 4);

        const ifd0Count = g16(tiffStart + g32(tiffStart + 4));
        let gpsOffset = 0;
        for (let i = 0; i < ifd0Count; i++) {
          const entry = tiffStart + g32(tiffStart + 4) + 2 + i * 12;
          if (entry + 12 > view.byteLength) break;
          if (g16(entry) === 0x8825) {
            gpsOffset = tiffStart + g32(entry + 8);
            break;
          }
        }
        if (!gpsOffset || gpsOffset + 2 > view.byteLength) return null;

        const gpsCount = g16(gpsOffset);
        const tags: Record<number, { type: number; count: number; valueOffset: number }> = {};
        for (let i = 0; i < gpsCount; i++) {
          const e = gpsOffset + 2 + i * 12;
          if (e + 12 > view.byteLength) break;
          tags[g16(e)] = { type: g16(e + 2), count: g32(e + 4), valueOffset: tiffStart + g32(e + 8) };
        }

        const toDeg = (tag: { valueOffset: number }) => {
          const o = tag.valueOffset;
          return readRational(o) + readRational(o + 8) / 60 + readRational(o + 16) / 3600;
        };

        if (!tags[2] || !tags[4]) return null;
        let lat = toDeg(tags[2]);
        let lng = toDeg(tags[4]);

        const latRef = tags[1] ? String.fromCharCode(view.getUint8(gpsOffset + 2 + (() => {
          for (let i = 0; i < gpsCount; i++) {
            if (g16(gpsOffset + 2 + i * 12) === 1) return i * 12 + 8;
          }
          return 0;
        })())) : "N";
        const lngRef = tags[3] ? String.fromCharCode(view.getUint8(gpsOffset + 2 + (() => {
          for (let i = 0; i < gpsCount; i++) {
            if (g16(gpsOffset + 2 + i * 12) === 3) return i * 12 + 8;
          }
          return 0;
        })())) : "E";

        if (latRef === "S") lat = -lat;
        if (lngRef === "W") lng = -lng;

        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && (lat !== 0 || lng !== 0)) {
          return [lat, lng];
        }
        return null;
      }
      const len = view.getUint16(offset + 2);
      offset += 2 + len;
    }
  } catch {
    return null;
  }
  return null;
}
