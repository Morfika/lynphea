function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function editDistance(left: string, right: string) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row++) {
    const current = [row];
    for (let column = 1; column <= right.length; column++) {
      current[column] = Math.min(
        (current[column - 1] ?? 0) + 1,
        (previous[column] ?? 0) + 1,
        (previous[column - 1] ?? 0) + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

export function fuzzySearchScore(search: string, fields: string[]) {
  const query = normalizeSearchText(search);
  if (!query) return 0;

  const normalizedFields = fields.map(normalizeSearchText).filter(Boolean);
  if (normalizedFields.some((field) => field.includes(query))) {
    const normalizedName = normalizedFields[0] ?? "";
    return normalizedName.startsWith(query) ? 1 : 0.94;
  }

  const queryTokens = query.split(" ").filter(Boolean);
  const fieldTokens = normalizedFields.flatMap((field) => field.split(" "));
  const tokenScores = queryTokens.map((token) => {
    let best = 0;
    for (const candidate of fieldTokens) {
      if (candidate.startsWith(token) || token.startsWith(candidate)) {
        best = Math.max(
          best,
          Math.min(token.length, candidate.length) / Math.max(token.length, candidate.length),
        );
        continue;
      }
      if (token.length < 3 || candidate.length < 3) continue;
      const distance = editDistance(token, candidate);
      const similarity = 1 - distance / Math.max(token.length, candidate.length);
      if (distance <= Math.max(1, Math.floor(token.length * 0.35))) {
        best = Math.max(best, similarity);
      }
    }
    return best;
  });
  const score = tokenScores.reduce((sum, value) => sum + value, 0) / queryTokens.length;
  return score >= 0.55 ? score : 0;
}
