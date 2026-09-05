"use server";

import { auth } from "@/lib/auth";
import {
  acceptInvitation,
  acceptInvitationForUser,
  getInvitationByToken,
  type InvitationView,
} from "@/lib/invitation-service";
import { prisma } from "@/lib/prisma";
import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

function invitePath(token: string, fehler?: string) {
  return fehler ? `/invite/${token}?fehler=${fehler}` : `/invite/${token}`;
}

function formString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function apiErrorCode(error: unknown) {
  return error instanceof APIError
    ? (error.body as { code?: string } | undefined)?.code
    : undefined;
}

async function requirePendingInvitation(token: string): Promise<InvitationView> {
  const invitation = await getInvitationByToken(token);

  if (!invitation) {
    redirect(invitePath(token, "not_found"));
  }

  if (invitation.status !== "PENDING") {
    redirect(invitePath(token, "already_accepted"));
  }

  if (invitation.expired) {
    redirect(invitePath(token, "expired"));
  }

  return invitation;
}

/**
 * Der Einladungslink wurde an genau dieses Postfach verschickt – wer den
 * Token besitzt, hat damit den Zugriff auf die E-Mail-Adresse nachgewiesen.
 * Eine separate Bestätigungs-Mail ist deshalb nicht mehr nötig.
 */
async function markEmailVerified(email: string) {
  await prisma.user.updateMany({
    where: { email: email.trim().toLowerCase() },
    data: { emailVerified: true },
  });
}

async function finishAcceptance(
  token: string,
  user: { id: string; email: string; name?: string },
): Promise<never> {
  const result = await acceptInvitationForUser(token, user);

  if (result.ok) {
    redirect(`/u/${result.tenantSlug}`);
  }

  redirect(invitePath(token, result.reason.toLowerCase()));
}

export async function acceptInvitationAction(formData: FormData) {
  const token = formString(formData, "token");

  if (!token) {
    redirect("/login");
  }

  const result = await acceptInvitation(token);

  if (result.ok) {
    redirect(`/u/${result.tenantSlug}`);
  }

  if (result.reason === "NOT_LOGGED_IN") {
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  redirect(`/invite/${token}?fehler=${result.reason.toLowerCase()}`);
}

export async function loginAndAcceptInvitationAction(formData: FormData) {
  const token = formString(formData, "token");
  const password = String(formData.get("password") ?? "");

  if (!token) {
    redirect("/login");
  }

  const invitation = await requirePendingInvitation(token);

  if (!password) {
    redirect(invitePath(token, "invalid_password"));
  }

  const requestHeaders = await headers();

  async function signIn() {
    const result = await auth.api.signInEmail({
      body: { email: invitation.email, password },
      headers: requestHeaders,
    });

    return result.user;
  }

  let user: Awaited<ReturnType<typeof signIn>> | undefined;

  try {
    user = await signIn();
  } catch (error) {
    if (apiErrorCode(error) === "EMAIL_NOT_VERIFIED") {
      await markEmailVerified(invitation.email);

      try {
        user = await signIn();
      } catch {
        redirect(invitePath(token, "invalid_password"));
      }
    } else if (error instanceof APIError) {
      redirect(invitePath(token, "invalid_password"));
    } else {
      redirect(invitePath(token, "unexpected_error"));
    }
  }

  if (!user) {
    redirect(invitePath(token, "invalid_password"));
  }

  await finishAcceptance(token, user);
}

export async function registerAndAcceptInvitationAction(formData: FormData) {
  const token = formString(formData, "token");
  const firstName = formString(formData, "firstName");
  const lastName = formString(formData, "lastName");
  const password = String(formData.get("password") ?? "");
  const passwordRepeat = String(formData.get("password_repeat") ?? "");
  const termsAccepted = formData.get("terms") === "on";

  if (!token) {
    redirect("/login");
  }

  const invitation = await requirePendingInvitation(token);

  if (password.length < 12) {
    redirect(invitePath(token, "password_too_short"));
  }

  if (password !== passwordRepeat) {
    redirect(invitePath(token, "password_mismatch"));
  }

  if (!termsAccepted) {
    redirect(invitePath(token, "terms_required"));
  }

  const name =
    `${firstName} ${lastName}`.trim() || invitation.email.split("@")[0];
  const requestHeaders = await headers();

  try {
    await auth.api.signUpEmail({
      body: {
        email: invitation.email,
        password,
        name,
        callbackURL: invitePath(token),
        // @ts-expect-error – zusätzliches Feld, wird im auth.ts-Hook geprüft
        terms: termsAccepted,
      },
      headers: requestHeaders,
    });
  } catch (error) {
    const code = apiErrorCode(error);

    if (code === "USER_ALREADY_EXISTS") {
      redirect(invitePath(token, "user_exists"));
    }

    if (error instanceof APIError) {
      redirect(invitePath(token, "signup_failed"));
    }

    redirect(invitePath(token, "unexpected_error"));
  }

  await markEmailVerified(invitation.email);

  let user: { id: string; email: string; name?: string } | undefined;

  try {
    const result = await auth.api.signInEmail({
      body: { email: invitation.email, password },
      headers: requestHeaders,
    });

    user = result.user;
  } catch {
    redirect(invitePath(token, "signin_failed"));
  }

  await finishAcceptance(token, user);
}
