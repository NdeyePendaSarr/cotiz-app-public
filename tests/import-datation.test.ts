import { describe, expect, it } from "vitest";
import { apparierReprises, type SmsIgnore } from "@/lib/import/datation";

const sms = (id: string, personneId: string | null, montant: number, jour: string): SmsIgnore => ({ id, personneId, montant, dateReception: new Date(`2026-10-${jour}T10:00:00Z`) });

describe("apparierReprises (dater les versés importés avec leurs SMS)", () => {
  it("un SMS du même montant : sa date", () => {
    expect(apparierReprises([{ id: "r1", personneId: "awa", montant: 2_000 }], [sms("s1", "awa", 2_000, "25")])).toEqual([
      { repriseId: "r1", smsIds: ["s1"], date: new Date("2026-10-25T10:00:00Z") },
    ]);
  });

  it("deux SMS qui font le montant (1 000 + 1 000) : la date du dernier", () => {
    const d = apparierReprises([{ id: "r1", personneId: "awa", montant: 2_000 }], [sms("s2", "awa", 1_000, "27"), sms("s1", "awa", 1_000, "24")]);
    expect(d).toEqual([{ repriseId: "r1", smsIds: ["s1", "s2"], date: new Date("2026-10-27T10:00:00Z") }]);
  });

  it("ne devine jamais : montant différent, deux SMS du même montant, plusieurs versés, SMS sans personne", () => {
    expect(apparierReprises([{ id: "r1", personneId: "awa", montant: 2_000 }], [sms("s1", "awa", 3_000, "25")])).toEqual([]);
    expect(apparierReprises([{ id: "r1", personneId: "awa", montant: 2_000 }], [sms("s1", "awa", 2_000, "25"), sms("s2", "awa", 2_000, "26")])).toEqual([]);
    expect(
      apparierReprises(
        [
          { id: "r1", personneId: "awa", montant: 2_000 },
          { id: "r2", personneId: "awa", montant: 2_000 },
        ],
        [sms("s1", "awa", 2_000, "25")],
      ),
    ).toEqual([]);
    expect(apparierReprises([{ id: "r1", personneId: "awa", montant: 2_000 }], [sms("s1", null, 2_000, "25")])).toEqual([]);
  });

  it("chaque personne est traitée à part", () => {
    const d = apparierReprises(
      [
        { id: "r1", personneId: "awa", montant: 2_000 },
        { id: "r2", personneId: "fatou", montant: 5_000 },
      ],
      [sms("s1", "awa", 2_000, "25"), sms("s2", "fatou", 2_000, "26")],
    );
    expect(d.map((x) => x.repriseId)).toEqual(["r1"]);
  });
});
