export function supabaseVerifier(url, anonKey, fetchImpl = fetch) {
  const issuer = new URL(url);
  if (issuer.protocol !== "https:" || issuer.href !== issuer.origin + "/")
    throw Error("Configure an HTTPS identity issuer");
  return async (token) => {
    const res = await fetchImpl(new URL("/auth/v1/user", issuer), {
      headers: { authorization: "Bearer " + token, apikey: anonKey },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok)
      throw Object.assign(Error("Identity could not be verified"), {
        status: 401,
      });
    const user = await res.json();
    if (
      typeof user.id !== "string" ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(user.id)
    )
      throw Object.assign(Error("Invalid issuer subject"), { status: 401 });
    // Auth has verified this exact token. Its expiry caps the derived Atlas session.
    let claims;
    try {
      claims = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
      );
    } catch {}
    if (
      claims?.iss !== issuer.origin + "/auth/v1" ||
      claims.sub !== user.id ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp <= Date.now() / 1000
    )
      throw Object.assign(Error("Invalid issuer claims"), { status: 401 });
    return { subject: issuer.origin + "#" + user.id, expiresAt: claims.exp };
  };
}
