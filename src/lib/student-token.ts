import { SignJWT, jwtVerify } from "jose";
import { getServerEnv } from "@/lib/env";

/**
 * Creates a signed, tamper-proof, expiring JWT for Student Portal lookup sessions.
 * Valid for 2 hours.
 */
export async function createStudentPortalToken(payload: {
  studentId: string;
  studentCode: string;
}): Promise<string> {
  const { AUTH_SECRET } = getServerEnv();
  const secretKey = new TextEncoder().encode(AUTH_SECRET);

  return await new SignJWT({
    sub: payload.studentId,
    code: payload.studentCode,
    role: "student",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .setIssuer("english-manager")
    .sign(secretKey);
}

/**
 * Verifies a student portal token and extracts the bound studentId & studentCode.
 * Returns null if expired or signature is invalid.
 */
export async function verifyStudentPortalToken(token: string): Promise<{
  studentId: string;
  studentCode: string;
} | null> {
  try {
    const { AUTH_SECRET } = getServerEnv();
    const secretKey = new TextEncoder().encode(AUTH_SECRET);
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: "english-manager",
      algorithms: ["HS256"],
    });
    if (
      payload.role !== "student" ||
      typeof payload.sub !== "string" ||
      !payload.sub ||
      typeof payload.code !== "string" ||
      !payload.code
    ) {
      return null;
    }
    return {
      studentId: payload.sub,
      studentCode: payload.code,
    };
  } catch {
    return null;
  }
}
