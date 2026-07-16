export type CreateCustomPersonaInput = {
  displayName: string;
  groundingNote: string;
};

export type CreateCouncilSessionInput = {
  ideaId: string | null;
  personaKeys: string[];
  title: string;
};

function optionalId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeCreateCustomPersona(raw: unknown): CreateCustomPersonaInput {
  if (!raw || typeof raw !== "object") throw new Error("无效输入");
  const input = raw as Record<string, unknown>;

  const displayName =
    typeof input.displayName === "string" ? input.displayName.trim() : "";
  if (!displayName) throw new Error("顾问姓名不能为空");
  if (displayName.length > 60) throw new Error("顾问姓名不能超过 60 字");

  const groundingNote =
    typeof input.groundingNote === "string" ? input.groundingNote.trim() : "";
  if (groundingNote.length < 30) {
    throw new Error("必须填写这个人物已知的核心思想/方法论依据（至少 30 字），AI 才有据可依");
  }
  if (groundingNote.length > 500) throw new Error("方法论依据不能超过 500 字");

  return { displayName, groundingNote };
}

export function slugifyPersonaName(displayName: string): string {
  const base = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "custom";
}

export function normalizeCreateCouncilSession(raw: unknown): CreateCouncilSessionInput {
  if (!raw || typeof raw !== "object") throw new Error("无效输入");
  const input = raw as Record<string, unknown>;

  const ideaId = optionalId(input.ideaId);

  if (!Array.isArray(input.personaKeys) || input.personaKeys.length === 0) {
    throw new Error("至少邀请一位顾问");
  }
  if (input.personaKeys.length > 8) {
    throw new Error("单场会话最多邀请 8 位顾问");
  }
  const personaKeys = Array.from(
    new Set(
      input.personaKeys.map((key, i) => {
        if (typeof key !== "string" || !key.trim()) {
          throw new Error(`personaKeys[${i}] 无效`);
        }
        return key.trim();
      })
    )
  );

  const title = typeof input.title === "string" ? input.title.trim().slice(0, 120) : "";

  return { ideaId, personaKeys, title };
}
