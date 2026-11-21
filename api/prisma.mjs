import crypto$1 from "node:crypto";
import path from "node:path";
import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
// src/lib/prisma.ts
/**
* DevProof (TikTrack) - Prisma ORM Client for Supabase PostgreSQL
*
* Uses @prisma/adapter-pg (Prisma 7 Driver Adapter) connected to Supabase's
* Supavisor transaction pooler (DATABASE_URL, port 6543, ?pgbouncer=true).
*
* Security Boundary:
* This module runs ONLY in a Node.js / server environment (Vite server middleware,
* API routes, CLI scripts, seed scripts). Never import this module directly in
* browser-only components; browser code uses `src/lib/prismaApiClient.ts`.
*/
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
const globalForPrisma = globalThis;
function getDatabaseUrl() {
	return process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}
function isPrismaDatabaseConfigured() {
	const url = process.env.DATABASE_URL;
	if (!url) return false;
	if (url.includes("[YOUR-PASSWORD]") || url.includes("your-db-password") || url.includes("your-password")) return false;
	return true;
}
function createPrismaClient() {
	const connectionString = getDatabaseUrl();
	const adapter = new PrismaPg({ connectionString });
	return new PrismaClient({
		adapter,
		log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
	});
}
const prisma = globalForPrisma.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
async function checkPrismaConnection() {
	const configured = isPrismaDatabaseConfigured();
	const refMatch = (process.env.VITE_SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
	const projectRef = refMatch ? refMatch[1] : null;
	if (!configured) return {
		connected: false,
		configured: false,
		projectRef,
		message: "DATABASE_URL in .env.local contains placeholder password ([YOUR-PASSWORD]). Replace with your Supabase Postgres password to enable live Prisma queries."
	};
	try {
		await prisma.$queryRaw`SELECT 1`;
		return {
			connected: true,
			configured: true,
			projectRef,
			message: "Connected to Supabase PostgreSQL via Prisma ORM."
		};
	} catch (err) {
		return {
			connected: false,
			configured: true,
			projectRef,
			message: `Prisma connection error: ${err instanceof Error ? err.message : String(err)}`
		};
	}
}
// src/server/emailService.ts
const RESEND_API_URL = "https://api.resend.com/emails";
function getAppBaseUrl() {
	if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/+$/, "");
	if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/+$/, "")}`;
	if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/+$/, "")}`;
	return "http://localhost:5173";
}
function getResendConfig() {
	const apiKey = (process.env.RESEND_API_KEY || "").trim();
	if (!apiKey) return null;
	return {
		apiKey,
		from: (process.env.RESEND_FROM_EMAIL || "TikTrack <noreply@dev.kodemargin.com>").trim()
	};
}
/**
* Sends an email directly via the Resend REST API (Supabase email delivery disabled).
*/
async function sendViaResend(params) {
	const cfg = getResendConfig();
	if (!cfg) return {
		ok: false,
		message: "RESEND_API_KEY is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL in your environment."
	};
	try {
		const response = await fetch(RESEND_API_URL, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${cfg.apiKey}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				from: cfg.from,
				to: [params.to],
				subject: params.subject,
				html: params.html,
				text: params.text
			})
		});
		const data = await response.json().catch(() => ({}));
		if (!response.ok) {
			const errMsg = data.message || `Resend API rejected request (${response.status}).`;
			console.error("[EmailService] Resend rejected email:", {
				to: params.to,
				status: response.status,
				errMsg
			});
			return {
				ok: false,
				message: errMsg
			};
		}
		return {
			ok: true,
			id: data.id,
			message: `Email sent to ${params.to} via Resend.`
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error("[EmailService] Resend network error:", message);
		return {
			ok: false,
			message: `Resend network error: ${message}`
		};
	}
}
function getSupabaseAdminClient$1() {
	const url = process.env.VITE_SUPABASE_URL || "";
	const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
	if (!url || !serviceKey) return null;
	return createClient(url, serviceKey, { auth: {
		autoRefreshToken: false,
		persistSession: false
	} });
}
/**
* Ensures the user exists in Supabase Auth (`auth.users`) BEFORE Prisma inserts into
* `public.user_profiles` (which references `auth.users(id)`), returning the canonical
* `auth.users.id` UUID. If `temporaryPassword` is provided, sets/updates the password
* and `mustChangePassword: true` silently without triggering Supabase emails.
*/
async function ensureSupabaseAuthUser(params) {
	const admin = getSupabaseAdminClient$1();
	if (!admin) return {
		ok: false,
		message: "SUPABASE_SERVICE_ROLE_KEY is not configured."
	};
	const normalizedEmail = params.email.trim().toLowerCase();
	const tempPassword = params.temporaryPassword?.trim() || "";
	const workspaceName = params.tenantName?.trim() || "TikTrack Workspace";
	try {
		const { data: listData } = await admin.auth.admin.listUsers({
			page: 1,
			perPage: 1e3
		});
		const existing = listData?.users?.find((u) => u.email?.toLowerCase() === normalizedEmail);
		if (existing) {
			if (tempPassword) {
				const { error: updateErr } = await admin.auth.admin.updateUserById(existing.id, {
					password: tempPassword,
					email_confirm: true,
					user_metadata: {
						...existing.user_metadata,
						fullName: params.name,
						...params.tenantId ? { tenantId: params.tenantId } : {},
						...params.tenantName ? { tenantName: workspaceName } : {},
						...params.role ? { role: params.role } : {},
						mustChangePassword: true
					}
				});
				if (updateErr) console.warn("[EmailService] Supabase admin updateUserById warning:", updateErr.message);
			}
			return {
				ok: true,
				userId: existing.id
			};
		}
		const effectivePassword = tempPassword || `TT-${Math.random().toString(36).slice(2, 10)}A1!`;
		const { data: created, error: createErr } = await admin.auth.admin.createUser({
			email: normalizedEmail,
			password: effectivePassword,
			email_confirm: true,
			user_metadata: {
				fullName: params.name,
				...params.tenantId ? { tenantId: params.tenantId } : {},
				...params.tenantName ? { tenantName: workspaceName } : {},
				...params.role ? { role: params.role } : {},
				mustChangePassword: Boolean(tempPassword)
			}
		});
		if (createErr || !created?.user?.id) {
			console.warn("[EmailService] Supabase admin createUser warning:", createErr?.message);
			return {
				ok: false,
				message: createErr?.message || "Failed to provision Supabase Auth user."
			};
		}
		return {
			ok: true,
			userId: created.user.id
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error("[EmailService] Supabase ensureAuthUser error:", message);
		return {
			ok: false,
			message
		};
	}
}
function escapeHtml(value) {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function renderOtpBlockHtml(otpCode, label) {
	if (!otpCode) return "";
	return `
    <div style="margin:20px 0;padding:16px;border-radius:10px;background:#f4effc;border:1px solid #c5a8f0;text-align:center;">
      <div style="font-size:11px;color:#581eae;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">
        ${escapeHtml(label)}
      </div>
      <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:28px;font-weight:800;letter-spacing:0.22em;color:#18181b;">
        ${escapeHtml(otpCode)}
      </div>
      <p style="margin:8px 0 0;font-size:12px;color:#52525b;">
        If the button above does not work, enter this 6-digit code directly on the TikTrack screen.
      </p>
    </div>
  `;
}
/**
* Registers a new Tenant Owner silently in Supabase Auth (NO Supabase email sent),
* generates both a verification link AND a 6-digit OTP fallback, and dispatches
* the verification email directly via Resend API.
*/
async function sendOwnerSignupVerificationEmail(params) {
	const admin = getSupabaseAdminClient$1();
	if (!admin) return {
		ok: false,
		message: "SUPABASE_SERVICE_ROLE_KEY is required on the server to generate Resend signup verification."
	};
	const email = params.email.trim().toLowerCase();
	const fullName = params.fullName.trim() || email.split("@")[0];
	const redirectTo = params.redirectTo || `${getAppBaseUrl()}/auth-privacy`;
	const { data, error } = await admin.auth.admin.generateLink({
		type: "signup",
		email,
		password: params.password,
		options: {
			redirectTo,
			data: {
				full_name: fullName,
				timezone: params.timezone || "UTC",
				country_code: params.countryCode || "US",
				country_name: params.countryName || "United States",
				account_type: "tenant_owner"
			}
		}
	});
	if (error || !data?.properties?.action_link) return {
		ok: false,
		message: error?.message || "Could not create owner account or verification link."
	};
	const verifyLink = data.properties.action_link;
	const otpCode = data.properties.email_otp || "";
	const resendResult = await sendViaResend({
		to: email,
		subject: "Verify your TikTrack Tenant Owner account",
		html: `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#18181b;background:#ffffff;">
      <div style="display:inline-block;background:#6d25da;color:#ffffff;font-weight:800;font-size:14px;padding:6px 12px;border-radius:8px;margin-bottom:16px;">
        TikTrack
      </div>
      <h2 style="margin:0 0 8px;font-size:20px;color:#09090b;">
        Verify your Tenant Owner account
      </h2>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#3f3f46;">
        Hi ${escapeHtml(fullName)}, thanks for signing up for TikTrack. Confirm your email address to create your company workspace.
      </p>
      <a href="${escapeHtml(verifyLink)}" style="display:inline-block;margin-top:4px;padding:11px 20px;border-radius:8px;background:#6d25da;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">
        Verify Email Address
      </a>
      ${renderOtpBlockHtml(otpCode, "Or Enter This 6-Digit Verification Code")}
      <p style="margin:20px 0 0;font-size:12px;color:#71717a;line-height:1.5;">
        If you did not request a TikTrack workspace account, you can safely ignore this email.
      </p>
    </div>
  `,
		text: [
			`Hi ${fullName},`,
			``,
			`Verify your TikTrack Tenant Owner account by opening this link:`,
			verifyLink,
			otpCode ? `` : "",
			otpCode ? `Or enter this 6-digit verification code on the sign-up screen: ${otpCode}` : ""
		].filter(Boolean).join("\n")
	});
	return {
		ok: resendResult.ok,
		hasOtp: Boolean(otpCode),
		message: resendResult.ok ? `Verification email & 6-digit OTP sent to ${email} via Resend.` : resendResult.message
	};
}
/**
* Provisions the invited user silently in Supabase Auth (no Supabase email sent)
* with their temporary password + `mustChangePassword: true`, then dispatches
* the branded invitation email directly via Resend API.
*/
async function sendWorkspaceInviteEmail(params) {
	const workspaceName = params.tenantName?.trim() || "TikTrack Workspace";
	const loginUrl = params.redirectTo || `${getAppBaseUrl()}/`;
	const tempPassword = params.temporaryPassword?.trim() || "";
	if (!params.skipAuthProvision && tempPassword) await ensureSupabaseAuthUser({
		email: params.email,
		name: params.name,
		role: params.role,
		tenantId: params.tenantId,
		tenantName: workspaceName,
		temporaryPassword: tempPassword
	});
	const safeName = escapeHtml(params.name);
	const safeWorkspace = escapeHtml(workspaceName);
	const safeRole = escapeHtml(params.role.replace(/_/g, " "));
	const safeEmail = escapeHtml(params.email);
	const safeTempPass = escapeHtml(tempPassword);
	const safeLoginUrl = escapeHtml(loginUrl);
	const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#18181b;background:#ffffff;">
      <div style="display:inline-block;background:#6d25da;color:#ffffff;font-weight:800;font-size:14px;padding:6px 12px;border-radius:8px;margin-bottom:16px;">
        TikTrack
      </div>
      <h2 style="margin:0 0 8px;font-size:20px;color:#09090b;">
        You're invited to join ${safeWorkspace}
      </h2>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#3f3f46;">
        Hi ${safeName}, you have been added to <strong>${safeWorkspace}</strong> as a <strong>${safeRole}</strong>.
      </p>
      ${tempPassword ? `
      <div style="margin:20px 0;padding:16px;border-radius:10px;background:#f4effc;border:1px solid #c5a8f0;">
        <div style="font-size:12px;color:#581eae;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">
          Your Temporary Login Credentials
        </div>
        <div style="font-size:14px;color:#18181b;margin-bottom:4px;">
          <strong>Email:</strong> ${safeEmail}
        </div>
        <div style="font-size:14px;color:#18181b;">
          <strong>Temporary Password:</strong>
          <code style="background:#ffffff;padding:3px 8px;border-radius:6px;border:1px solid #d4d4d8;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;color:#581eae;">${safeTempPass}</code>
        </div>
        <p style="margin:10px 0 0;font-size:12px;color:#52525b;">
          You must change this temporary password on your first login to activate your profile. Tasks can only be assigned to you once your profile is active.
        </p>
      </div>
    ` : ""}
      <a href="${safeLoginUrl}" style="display:inline-block;margin-top:8px;padding:11px 20px;border-radius:8px;background:#6d25da;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">
        Sign In &amp; Activate Profile
      </a>
      <p style="margin:24px 0 0;font-size:12px;color:#71717a;line-height:1.5;">
        After activating your profile, you can also sign in on the TikTrack Desktop Agent using your email &amp; new password or your Device Pairing Token.
      </p>
    </div>
  `;
	const text = [
		`Hi ${params.name},`,
		``,
		`You have been invited to join ${workspaceName} on TikTrack as ${params.role}.`,
		tempPassword ? `Email: ${params.email}` : "",
		tempPassword ? `Temporary Password: ${tempPassword}` : "",
		tempPassword ? `You must change your temporary password on first login to activate your profile before tasks can be assigned to you.` : "",
		``,
		`Sign in here: ${loginUrl}`
	].filter(Boolean).join("\n");
	const resendResult = await sendViaResend({
		to: params.email,
		subject: `Welcome to ${workspaceName} on TikTrack - Activate your profile`,
		html,
		text
	});
	return {
		ok: resendResult.ok,
		method: "resend_direct",
		message: resendResult.message
	};
}
/**
* Sends a password recovery email with BOTH a clickable reset link AND a 6-digit OTP
* directly via Resend API (Supabase email delivery disabled).
*/
async function sendPasswordRecoveryEmail(params) {
	const admin = getSupabaseAdminClient$1();
	const redirectTo = params.redirectTo || `${getAppBaseUrl()}/auth-privacy`;
	let recoveryLink = params.recoveryUrl || redirectTo;
	let otpCode = "";
	if (admin && !params.recoveryUrl) {
		const { data, error } = await admin.auth.admin.generateLink({
			type: "recovery",
			email: params.email.trim().toLowerCase(),
			options: { redirectTo }
		});
		if (error) return {
			ok: false,
			message: error.message
		};
		if (data?.properties?.action_link) recoveryLink = data.properties.action_link;
		if (data?.properties?.email_otp) otpCode = data.properties.email_otp;
	}
	const safeLink = escapeHtml(recoveryLink);
	const resendResult = await sendViaResend({
		to: params.email,
		subject: "Reset your TikTrack password",
		html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#18181b;background:#ffffff;">
        <div style="display:inline-block;background:#6d25da;color:#ffffff;font-weight:800;font-size:14px;padding:6px 12px;border-radius:8px;margin-bottom:16px;">
          TikTrack
        </div>
        <h2 style="margin:0 0 12px;font-size:20px;color:#09090b;">Password Reset Request</h2>
        <p style="font-size:14px;color:#3f3f46;line-height:1.5;">
          Click the button below to choose a new password for your TikTrack account.
        </p>
        <a href="${safeLink}" style="display:inline-block;margin-top:8px;padding:11px 20px;border-radius:8px;background:#6d25da;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">
          Reset Password
        </a>
        ${renderOtpBlockHtml(otpCode, "Or Enter This 6-Digit Reset Code")}
      </div>
    `,
		text: [`Reset your TikTrack password: ${recoveryLink}`, otpCode ? `Or enter this 6-digit reset code: ${otpCode}` : ""].filter(Boolean).join("\n")
	});
	return {
		ok: resendResult.ok,
		hasOtp: Boolean(otpCode),
		message: resendResult.ok ? `Password reset link & 6-digit OTP sent to ${params.email} via Resend.` : resendResult.message
	};
}
// src/server/prismaPhase2Handlers.ts
/**
* DevProof (TikTrack) - Prisma ORM Phase 2 Handlers
*
* Persists Phase 2 workflows (Activity Batches, Idle Gap Reconciliation,
* GitHub/GitLab Webhook Deduplication, Evidence Artifacts/Links & Session Annotations)
* via Prisma ORM when DATABASE_URL is connected.
*/
async function handleIngestWebhookPrisma(body) {
	if (!isValidUuid(body.tenantId) || !isValidUuid(body.projectId)) return {
		ok: false,
		deduplicated: false,
		deliveryAttemptCount: 1
	};
	return prisma.$transaction(async (tx) => {
		const existingReceipt = await tx.webhookReceipt.findUnique({ where: { provider_deliveryId: {
			provider: body.provider,
			deliveryId: body.deliveryId
		} } });
		let deliveryAttemptCount = 1;
		let deduplicated = false;
		if (existingReceipt) {
			deduplicated = true;
			deliveryAttemptCount = (await tx.webhookReceipt.update({
				where: { id: existingReceipt.id },
				data: {
					deliveryAttemptCount: { increment: 1 },
					status: "duplicate_ignored",
					processedAtUtc: /* @__PURE__ */ new Date()
				}
			})).deliveryAttemptCount;
		} else await tx.webhookReceipt.create({ data: {
			tenantId: body.tenantId,
			provider: body.provider,
			deliveryId: body.deliveryId,
			eventType: body.eventType,
			signatureVerified: body.signatureVerified,
			payloadSha256: body.payloadSha256,
			deliveryAttemptCount: 1,
			status: body.signatureVerified ? "processed" : "rejected_signature",
			processedAtUtc: /* @__PURE__ */ new Date()
		} });
		if (!body.signatureVerified) return {
			ok: false,
			deduplicated,
			deliveryAttemptCount,
			error: "Invalid HMAC signature"
		};
		const artifact = await tx.evidenceArtifact.upsert({
			where: { tenantId_sourceType_externalId: {
				tenantId: body.tenantId,
				sourceType: body.sourceType,
				externalId: body.externalId
			} },
			update: { summaryTitle: body.summaryTitle },
			create: {
				tenantId: body.tenantId,
				projectId: body.projectId,
				sourceType: body.sourceType,
				captureMode: "webhook",
				externalId: body.externalId,
				occurredAtUtc: /* @__PURE__ */ new Date(),
				actorUserId: isValidUuid(body.actorUserId ?? void 0) ? body.actorUserId : null,
				summaryTitle: body.summaryTitle,
				metadata: body.metadata,
				reliabilityStatus: "verified_webhook"
			}
		});
		if (body.taskId && isValidUuid(body.taskId)) await tx.evidenceLink.upsert({
			where: { tenantId_taskId_artifactId: {
				tenantId: body.tenantId,
				taskId: body.taskId,
				artifactId: artifact.id
			} },
			update: {},
			create: {
				tenantId: body.tenantId,
				projectId: body.projectId,
				taskId: body.taskId,
				artifactId: artifact.id,
				linkType: body.linkType,
				linkConfidence: body.linkType === "contemporaneous" ? .95 : .85,
				linkRationale: body.linkRationale
			}
		});
		return {
			ok: true,
			deduplicated,
			deliveryAttemptCount,
			artifactId: artifact.id
		};
	});
}
async function handleCreateSessionAnnotationPrisma(body) {
	if (!isValidUuid(body.tenantId) || !isValidUuid(body.userId) || !isValidUuid(body.sessionId)) return { ok: false };
	return {
		ok: true,
		annotationId: (await prisma.sessionAnnotation.create({ data: {
			tenantId: body.tenantId,
			userId: body.userId,
			sessionId: body.sessionId,
			annotationType: body.annotationType,
			title: body.title,
			contentMarkdown: body.contentMarkdown,
			startMinuteOfDay: body.startMinuteOfDay ?? null,
			endMinuteOfDay: body.endMinuteOfDay ?? null
		} })).id
	};
}
async function handleBootstrapPhase2Data() {
	const [dbRollups, dbArtifacts, dbAnnotations, dbIdeMappings, dbIntegrations, dbWebhookReceipts, dbDevices, dbExclusions, dbBatches] = await Promise.all([
		prisma.activityRollup.findMany({
			include: { session: true },
			orderBy: { bucketStartUtc: "asc" },
			take: 200
		}),
		prisma.evidenceArtifact.findMany({
			include: {
				actorUser: true,
				links: { include: { task: true } }
			},
			orderBy: { occurredAtUtc: "desc" },
			take: 100
		}),
		prisma.sessionAnnotation.findMany({
			include: {
				session: true,
				user: true
			},
			orderBy: { createdAt: "desc" },
			take: 100
		}),
		prisma.ideWorkspaceMapping.findMany({
			include: { task: true },
			orderBy: { updatedAt: "desc" },
			take: 100
		}),
		prisma.connectedIntegration.findMany({
			include: { repositoryLinks: true },
			orderBy: { createdAt: "asc" }
		}),
		prisma.webhookReceipt.findMany({
			orderBy: { receivedAtUtc: "desc" },
			take: 100
		}),
		prisma.device.findMany({
			include: { user: true },
			orderBy: { createdAt: "asc" }
		}),
		prisma.privacyExclusion.findMany({
			where: { isActive: true },
			orderBy: { createdAt: "desc" }
		}),
		prisma.activityEventBatch.findMany({
			include: {
				device: true,
				events: {
					orderBy: { occurredAtUtc: "asc" },
					take: 25
				}
			},
			orderBy: { receivedAtUtc: "desc" },
			take: 50
		})
	]);
	const minuteOfDayUtc = (d) => d.getUTCHours() * 60 + d.getUTCMinutes();
	return {
		activityRollups: dbRollups.map((r) => {
			const startMin = minuteOfDayUtc(r.bucketStartUtc);
			return {
				id: r.id,
				tenantId: r.tenantId,
				userId: r.userId,
				projectId: r.session.projectId,
				taskId: r.session.taskId,
				workDate: r.bucketStartUtc.toISOString().slice(0, 10),
				startMinuteOfDay: startMin,
				endMinuteOfDay: startMin + r.bucketMinutes,
				durationMinutes: r.bucketMinutes,
				appCategory: r.appCategory,
				workMode: r.workMode,
				hasInputSignal: r.hasInputSignal,
				concurrentSources: r.concurrentSources,
				isObservationGap: r.isObservationGap,
				reconciliationChoice: r.reconciliationChoice ?? void 0,
				reconciliationNote: r.reconciliationNote ?? void 0,
				reconciledAtUtc: r.reconciledAtUtc ? r.reconciledAtUtc.toISOString() : void 0,
				displayCount: r.displayCount
			};
		}),
		evidenceArtifacts: dbArtifacts.map((a) => {
			const link = a.links[0];
			return {
				id: a.id,
				tenantId: a.tenantId,
				projectId: a.projectId,
				taskId: link?.taskId ?? "",
				taskCode: link?.task.code ?? "UNLINKED",
				workDate: a.occurredAtUtc.toISOString().slice(0, 10),
				minuteOfDay: minuteOfDayUtc(a.occurredAtUtc),
				sourceType: a.sourceType,
				captureMode: a.captureMode,
				externalId: a.externalId,
				occurredAtUtc: a.occurredAtUtc.toISOString(),
				actorName: a.actorUser?.fullName ?? "Webhook",
				summaryTitle: a.summaryTitle,
				linkType: link?.linkType ?? "contemporaneous",
				linkConfidence: link ? Number(link.linkConfidence) : .9,
				linkRationale: link?.linkRationale ?? "",
				confirmedByUser: link?.confirmedByUser ?? false,
				overriddenByUser: link?.overriddenByUser ?? false,
				reliabilityStatus: a.reliabilityStatus,
				metadata: a.metadata ?? {}
			};
		}),
		sessionAnnotations: dbAnnotations.map((ann) => ({
			id: ann.id,
			tenantId: ann.tenantId,
			projectId: ann.session.projectId,
			taskId: ann.session.taskId,
			workDate: ann.createdAt.toISOString().slice(0, 10),
			startMinuteOfDay: ann.startMinuteOfDay ?? 0,
			endMinuteOfDay: ann.endMinuteOfDay ?? 0,
			authorName: ann.user.fullName,
			annotationType: ann.annotationType,
			title: ann.title,
			contentMarkdown: ann.contentMarkdown,
			createdAt: ann.createdAt.toISOString()
		})),
		ideMappings: dbIdeMappings.map((m) => ({
			id: m.id,
			tenantId: m.tenantId,
			userId: m.userId,
			projectId: m.projectId,
			taskId: m.taskId,
			taskCode: m.task.code,
			ideType: m.ideType,
			workspaceIdentifier: m.workspaceIdentifier,
			repoFullName: m.repoFullName ?? "",
			branchName: m.branchName,
			suggestedTaskCode: m.suggestedTaskCode ?? m.task.code,
			confidenceScore: Number(m.confidenceScore),
			confirmedByUser: m.confirmedByUser,
			overriddenByUser: m.overriddenByUser,
			updatedAt: m.updatedAt.toISOString()
		})),
		integrations: dbIntegrations.map((i) => ({
			id: i.id,
			tenantId: i.tenantId,
			provider: i.provider,
			displayName: i.displayName,
			installationId: i.installationId,
			status: i.status,
			scopeSummary: "Least-privilege verified webhook / IDE metadata scope",
			reposOrWorkspaces: i.repositoryLinks.map((rl) => rl.repoFullName),
			retentionDays: i.retentionDaysOverride ?? 365,
			lastSyncedAt: (i.lastSyncedAt ?? i.updatedAt).toISOString()
		})),
		webhookReceipts: dbWebhookReceipts.map((w) => ({
			id: w.id,
			tenantId: w.tenantId,
			provider: w.provider,
			deliveryId: w.deliveryId,
			eventType: w.eventType,
			signatureVerified: w.signatureVerified,
			payloadSha256: w.payloadSha256,
			deliveryAttemptCount: w.deliveryAttemptCount,
			status: w.status,
			summary: `${w.provider} ${w.eventType}`,
			receivedAtUtc: w.receivedAtUtc.toISOString()
		})),
		devices: dbDevices.map((d) => ({
			id: d.id,
			tenantId: d.tenantId,
			userId: d.userId,
			userName: d.user.fullName,
			deviceName: d.deviceName,
			osPlatform: d.osPlatform,
			agentVersion: d.agentVersion,
			updateChannel: d.updateChannel,
			lastClockDriftSeconds: d.lastClockDriftSeconds,
			clockAnomalyDetected: d.clockAnomalyDetected,
			multiDisplayPolicy: d.multiDisplayPolicy,
			revokedAt: d.revokedAt ? d.revokedAt.toISOString() : null,
			lastSeenAt: d.lastSeenAt.toISOString()
		})),
		privacyExclusions: dbExclusions.map((e) => ({
			id: e.id,
			tenantId: e.tenantId,
			userId: e.userId,
			pattern: e.exclusionPattern,
			exclusionType: e.exclusionType,
			reason: e.reason ?? "",
			createdAt: e.createdAt.toISOString()
		})),
		privacyAuditBatches: dbBatches.map((b) => ({
			batchId: b.id,
			tenantId: b.tenantId,
			userId: b.userId,
			deviceId: b.deviceId,
			deviceName: b.device.deviceName,
			source: b.source,
			receivedAtUtc: b.receivedAtUtc.toISOString(),
			retentionExpiresInDays: 90,
			eventCount: b.eventCount,
			suppressedByDenylistCount: 0,
			blockedSurveillanceKeysCount: 0,
			rawPayloadJson: {
				batch_id: b.id,
				source: b.source,
				agent_build: b.agentBuild,
				events: b.events.map((ev) => ({
					event_type: ev.eventType,
					occurred_at_utc: ev.occurredAtUtc.toISOString(),
					metadata: ev.metadata
				}))
			}
		}))
	};
}
async function handleAddPrivacyExclusionPrisma(body) {
	if (!isValidUuid(body.tenantId) || !isValidUuid(body.userId)) return { ok: false };
	return {
		ok: true,
		id: (await prisma.privacyExclusion.upsert({
			where: { tenantId_userId_exclusionPattern: {
				tenantId: body.tenantId,
				userId: body.userId,
				exclusionPattern: body.exclusionPattern
			} },
			update: {
				isActive: true,
				reason: body.reason
			},
			create: {
				tenantId: body.tenantId,
				userId: body.userId,
				exclusionPattern: body.exclusionPattern,
				exclusionType: body.exclusionType,
				reason: body.reason
			}
		})).id
	};
}
async function handleRemovePrivacyExclusionPrisma(body) {
	if (!isValidUuid(body.id)) return { ok: false };
	await prisma.privacyExclusion.delete({ where: { id: body.id } });
	return { ok: true };
}
async function handleToggleDeviceRevocationPrisma(body) {
	if (!isValidUuid(body.deviceId)) return { ok: false };
	await prisma.device.update({
		where: { id: body.deviceId },
		data: { revokedAt: body.revoked ? /* @__PURE__ */ new Date() : null }
	});
	return { ok: true };
}
async function handleReconcileGapPrisma(body) {
	if (!isValidUuid(body.rollupId)) return { ok: false };
	await prisma.activityRollup.update({
		where: { id: body.rollupId },
		data: {
			reconciliationChoice: body.choice,
			reconciliationNote: body.note,
			reconciledAtUtc: /* @__PURE__ */ new Date()
		}
	});
	return { ok: true };
}
// src/server/prismaPhase3Handlers.ts
/**
* DevProof (TikTrack) - Prisma ORM Phase 3 Handlers
*
* Persists Phase 3 workflows:
*  - Versioned Verification Rule Sets & Segment Rule Evaluations (F3-001..F3-010)
*  - Evidence Correlation Graph Edges (F3-004, F3-008)
*  - Guardrailed AI Generations & Tenant AI Opt-Out Toggle (F3-020..F3-027)
*  - Structured Disputes, Independent Escalation, Partial Approval & Credit Notes (F3-030..F3-035)
*/
async function handleBootstrapPhase3Data() {
	try {
		const [dbRuleSets, dbCorrelationEdges, dbAiGenerations, dbDisputes] = await Promise.all([
			prisma.verificationRuleSet.findMany({
				include: { createdByUser: true },
				orderBy: { versionNumber: "desc" },
				take: 50
			}),
			prisma.evidenceCorrelationEdge.findMany({
				orderBy: { createdAt: "desc" },
				take: 250
			}),
			prisma.aiGeneration.findMany({
				include: {
					authorUser: true,
					approver: true
				},
				orderBy: { createdAt: "desc" },
				take: 100
			}),
			prisma.dispute.findMany({
				include: {
					timesheet: { include: { user: true } },
					timesheetLine: true,
					openedBy: true,
					assignedReviewer: true,
					escalatedReviewer: true,
					messages: {
						include: { author: true },
						orderBy: { createdAt: "asc" }
					}
				},
				orderBy: { createdAt: "desc" },
				take: 100
			})
		]);
		return {
			ruleSets: dbRuleSets.map((rs) => ({
				id: rs.id,
				tenantId: rs.tenantId,
				versionNumber: rs.versionNumber,
				versionLabel: rs.versionLabel,
				effectiveFrom: rs.effectiveFrom.toISOString(),
				status: rs.status,
				rulesConfig: rs.rulesConfig,
				createdByName: rs.createdByUser?.fullName ?? "System Admin",
				createdAt: rs.createdAt.toISOString()
			})),
			correlationEdges: dbCorrelationEdges.map((e) => ({
				id: e.id,
				tenantId: e.tenantId,
				projectId: e.projectId,
				sourceNodeType: e.sourceNodeType,
				sourceNodeId: e.sourceNodeId,
				sourceLabel: e.sourceNodeId,
				targetNodeType: e.targetNodeType,
				targetNodeId: e.targetNodeId,
				targetLabel: e.targetNodeId,
				edgeType: e.edgeType,
				confidence: Number(e.confidence),
				rationale: e.rationale
			})),
			aiGenerations: dbAiGenerations.map((g) => ({
				id: g.id,
				tenantId: g.tenantId,
				userId: g.userId ?? void 0,
				targetType: g.targetType,
				targetId: g.targetId,
				targetLabel: g.targetId,
				generationMode: g.generationMode,
				modelId: g.modelId,
				promptVersion: g.promptVersion,
				sanitizedPromptPayload: g.sanitizedPromptPayload ?? {},
				citedEventIds: g.citedEventIds,
				citedArtifactIds: g.citedArtifactIds,
				draftMarkdown: g.draftMarkdown,
				humanApprovedMarkdown: g.humanApprovedMarkdown ?? void 0,
				status: g.status,
				tokensUsed: g.tokensUsed,
				approvedByName: g.approver?.fullName ?? void 0,
				approvedAt: g.approvedAt ? g.approvedAt.toISOString() : void 0,
				createdAt: g.createdAt.toISOString()
			})),
			disputes: dbDisputes.map((d) => ({
				id: d.id,
				tenantId: d.tenantId,
				timesheetId: d.timesheetId,
				timesheetLineId: d.timesheetLineId,
				taskCode: "TASK",
				taskTitle: d.timesheetLine.developerNote || "Timesheet Line",
				developerId: d.timesheet.userId,
				developerName: d.timesheet.user.fullName,
				openedByUserId: d.openedByUserId,
				openedByName: d.openedBy.fullName,
				assignedReviewerId: d.assignedReviewerId ?? void 0,
				assignedReviewerName: d.assignedReviewer?.fullName ?? void 0,
				escalatedReviewerId: d.escalatedReviewerId ?? void 0,
				escalatedReviewerName: d.escalatedReviewer?.fullName ?? void 0,
				escalationReason: d.escalationReason ?? void 0,
				dueDate: d.dueDate ? d.dueDate.toISOString().slice(0, 10) : void 0,
				requestedEvidenceType: d.requestedEvidenceType ?? void 0,
				status: d.status,
				disputedMinutes: Number(d.disputedMinutes),
				adjustedApprovedMinutes: d.adjustedApprovedMinutes ? Number(d.adjustedApprovedMinutes) : void 0,
				reason: d.reason,
				resolutionSummary: d.resolutionSummary ?? d.resolutionNote ?? void 0,
				policyVersionCode: "v1.0-2026-11",
				creditInvoiceId: d.creditInvoiceId ?? void 0,
				createdAt: d.createdAt.toISOString(),
				resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : void 0,
				messages: d.messages.map((m) => ({
					id: m.id,
					authorUserId: m.authorUserId,
					authorName: m.author.fullName,
					authorRole: "developer",
					messageType: m.messageType,
					messageMarkdown: m.messageMarkdown,
					attachedArtifactIds: m.attachedArtifactIds,
					beforeMinutes: m.beforeMinutes ? Number(m.beforeMinutes) : void 0,
					afterMinutes: m.afterMinutes ? Number(m.afterMinutes) : void 0,
					createdAt: m.createdAt.toISOString()
				}))
			}))
		};
	} catch {
		return {
			ruleSets: [],
			correlationEdges: [],
			aiGenerations: [],
			disputes: []
		};
	}
}
async function handleToggleTenantAiPrisma(body) {
	if (!isValidUuid(body.tenantId)) return { ok: false };
	await prisma.$transaction(async (tx) => {
		await tx.tenant.update({
			where: { id: body.tenantId },
			data: { aiEnabled: body.aiEnabled }
		});
		await tx.auditEntry.create({ data: {
			tenantId: body.tenantId,
			actorUserId: isValidUuid(body.actorUserId) ? body.actorUserId : null,
			actionType: "TENANT_AI_SETTING_CHANGED",
			targetEntity: `tenants:${body.tenantId}`,
			reason: `Set ai_enabled = ${String(body.aiEnabled)} (F3-027)`
		} });
	});
	return { ok: true };
}
async function handlePublishRuleSetPrisma(body) {
	if (!isValidUuid(body.tenantId)) return { ok: false };
	return {
		ok: true,
		id: (await prisma.$transaction(async (tx) => {
			await tx.verificationRuleSet.updateMany({
				where: {
					tenantId: body.tenantId,
					status: "active"
				},
				data: { status: "superseded" }
			});
			const ruleSet = await tx.verificationRuleSet.create({ data: {
				tenantId: body.tenantId,
				versionNumber: body.versionNumber,
				versionLabel: body.versionLabel,
				status: "active",
				rulesConfig: body.rulesConfig,
				simulationSummary: body.simulationSummary ?? null,
				createdBy: isValidUuid(body.createdBy) ? body.createdBy : null
			} });
			await tx.auditEntry.create({ data: {
				tenantId: body.tenantId,
				actorUserId: isValidUuid(body.createdBy) ? body.createdBy : null,
				actionType: "VERIFICATION_RULE_SET_PUBLISHED",
				targetEntity: `verification_rule_sets:v${body.versionNumber}`,
				targetId: ruleSet.id,
				reason: `Published rule set ${body.versionLabel} (no retroactive historical changes).`
			} });
			return ruleSet;
		})).id
	};
}
async function handleCreateAiGenerationPrisma(body) {
	if (!isValidUuid(body.tenantId)) return { ok: false };
	const tenant = await prisma.tenant.findUnique({ where: { id: body.tenantId } });
	if (!tenant) return {
		ok: false,
		error: "Tenant not found"
	};
	if (body.generationMode === "ai_guardrailed" && !tenant.aiEnabled) return {
		ok: false,
		error: "Tenant has AI assistance disabled (F3-027)."
	};
	return {
		ok: true,
		id: (await prisma.aiGeneration.create({ data: {
			tenantId: body.tenantId,
			userId: isValidUuid(body.userId) ? body.userId : null,
			targetType: body.targetType,
			targetId: body.targetId,
			generationMode: body.generationMode,
			modelId: body.modelId,
			promptVersion: body.promptVersion,
			sanitizedPromptPayload: body.sanitizedPromptPayload,
			citedEventIds: body.citedEventIds,
			citedArtifactIds: body.citedArtifactIds,
			draftMarkdown: body.draftMarkdown,
			status: "draft",
			tokensUsed: body.tokensUsed
		} })).id
	};
}
async function handleDecideAiGenerationPrisma(body) {
	if (!isValidUuid(body.generationId)) return { ok: false };
	await prisma.aiGeneration.update({
		where: { id: body.generationId },
		data: {
			status: body.status,
			...body.status === "edited_approved" ? {
				humanApprovedMarkdown: body.humanApprovedMarkdown ?? null,
				approvedByUserId: isValidUuid(body.approvedByUserId) ? body.approvedByUserId : null,
				approvedAt: /* @__PURE__ */ new Date()
			} : {}
		}
	});
	return { ok: true };
}
async function handlePartialApproveTimesheetPrisma(body) {
	if (!isValidUuid(body.tenantId) || !isValidUuid(body.reviewerUserId)) return { ok: false };
	const validLines = body.uncontestedLineIds.filter(isValidUuid);
	if (validLines.length === 0) return { ok: false };
	await prisma.$transaction(async (tx) => {
		for (const lineId of validLines) {
			const line = await tx.timesheetLine.findUnique({ where: { id: lineId } });
			if (!line || line.isLocked) continue;
			await tx.timesheetLine.update({
				where: { id: lineId },
				data: {
					approvedBillableMinutes: line.claimedMinutes,
					lineStatus: "approved",
					reviewerComment: body.reason
				}
			});
			await tx.reviewDecision.create({ data: {
				tenantId: body.tenantId,
				timesheetId: line.timesheetId,
				timesheetLineId: lineId,
				reviewerUserId: body.reviewerUserId,
				decisionType: "approve",
				reason: body.reason,
				previousApprovedMinutes: line.approvedBillableMinutes,
				newApprovedMinutes: line.claimedMinutes
			} });
		}
		if (isValidUuid(body.timesheetId)) await tx.timesheet.update({
			where: { id: body.timesheetId },
			data: { status: "partially_approved" }
		});
	});
	return { ok: true };
}
async function handleOpenDisputePrisma(body) {
	if (!isValidUuid(body.tenantId) || !isValidUuid(body.timesheetId) || !isValidUuid(body.timesheetLineId) || !isValidUuid(body.openedByUserId)) return { ok: false };
	return {
		ok: true,
		id: (await prisma.$transaction(async (tx) => {
			const dispute = await tx.dispute.create({ data: {
				tenantId: body.tenantId,
				timesheetId: body.timesheetId,
				timesheetLineId: body.timesheetLineId,
				openedByUserId: body.openedByUserId,
				assignedReviewerId: isValidUuid(body.assignedReviewerId) ? body.assignedReviewerId : null,
				dueDate: body.dueDate ? new Date(body.dueDate) : null,
				requestedEvidenceType: body.requestedEvidenceType ?? null,
				disputedMinutes: body.disputedMinutes,
				reason: body.reason,
				status: body.messageType === "clarification_request" ? "awaiting_developer" : "open"
			} });
			await tx.disputeMessage.create({ data: {
				tenantId: body.tenantId,
				disputeId: dispute.id,
				authorUserId: body.openedByUserId,
				messageType: body.messageType ?? "developer_appeal",
				messageMarkdown: body.reason,
				attachedArtifactIds: (body.attachedArtifactIds ?? []).filter(isValidUuid)
			} });
			await tx.timesheetLine.update({
				where: { id: body.timesheetLineId },
				data: { lineStatus: "disputed" }
			});
			return dispute;
		})).id
	};
}
async function handleDisputeActionPrisma(body) {
	if (!isValidUuid(body.tenantId) || !isValidUuid(body.disputeId) || !isValidUuid(body.actorUserId)) return { ok: false };
	const existing = await prisma.dispute.findUnique({ where: { id: body.disputeId } });
	if (!existing) return {
		ok: false,
		error: "Dispute not found"
	};
	if (body.action === "escalate") {
		if (!isValidUuid(body.escalatedReviewerId) || body.escalatedReviewerId === existing.assignedReviewerId || body.escalatedReviewerId === existing.openedByUserId) return {
			ok: false,
			error: "Independent second review requires a distinct reviewer (F3-033)."
		};
		await prisma.$transaction(async (tx) => {
			await tx.dispute.update({
				where: { id: body.disputeId },
				data: {
					status: "escalated",
					escalatedReviewerId: body.escalatedReviewerId,
					escalationReason: body.messageMarkdown ?? "Escalated for independent second review"
				}
			});
			await tx.disputeMessage.create({ data: {
				tenantId: body.tenantId,
				disputeId: body.disputeId,
				authorUserId: body.actorUserId,
				messageType: "escalation",
				messageMarkdown: body.messageMarkdown ?? "Escalated for independent second review"
			} });
		});
		return { ok: true };
	}
	if (body.action === "reply") {
		const nextStatus = existing.openedByUserId === body.actorUserId ? "awaiting_manager" : "awaiting_developer";
		await prisma.$transaction(async (tx) => {
			await tx.dispute.update({
				where: { id: body.disputeId },
				data: { status: nextStatus }
			});
			await tx.disputeMessage.create({ data: {
				tenantId: body.tenantId,
				disputeId: body.disputeId,
				authorUserId: body.actorUserId,
				messageType: existing.openedByUserId === body.actorUserId ? "developer_appeal" : "reviewer_note",
				messageMarkdown: body.messageMarkdown ?? "",
				attachedArtifactIds: (body.attachedArtifactIds ?? []).filter(isValidUuid)
			} });
		});
		return { ok: true };
	}
	await prisma.$transaction(async (tx) => {
		await tx.dispute.update({
			where: { id: body.disputeId },
			data: {
				status: body.resolutionStatus ?? "resolved_accepted",
				resolutionSummary: body.resolutionSummary ?? "",
				resolutionNote: body.resolutionSummary ?? "",
				adjustedApprovedMinutes: body.adjustedApprovedMinutes ?? null,
				resolvedAt: /* @__PURE__ */ new Date()
			}
		});
		await tx.disputeMessage.create({ data: {
			tenantId: body.tenantId,
			disputeId: body.disputeId,
			authorUserId: body.actorUserId,
			messageType: "resolution",
			messageMarkdown: body.resolutionSummary ?? "Dispute resolved",
			afterMinutes: body.adjustedApprovedMinutes ?? null
		} });
		await tx.auditEntry.create({ data: {
			tenantId: body.tenantId,
			actorUserId: body.actorUserId,
			actionType: "DISPUTE_RESOLVED",
			targetEntity: `disputes:${body.disputeId}`,
			targetId: body.disputeId,
			reason: body.resolutionSummary ?? "Dispute resolved"
		} });
	});
	return { ok: true };
}
// src/server/prismaPhase4Handlers.ts
/**
* DevProof (TikTrack) - Prisma ORM Phase 4 Handlers
*
* Persists Phase 4 workflows in Supabase PostgreSQL:
*  - SaaS Subscriptions & Separate SaaS Invoices (F4-001, F4-003)
*  - Seat & Usage Metering Snapshots (F4-002, F4-004)
*  - Agency White-Label Branding Config (F4-012)
*  - Scoped Public API Keys & Outbound Signed Webhooks (F4-006, F4-007)
*  - Ecosystem Connectors & Calendar Meeting Metadata (F4-008..F4-010)
*  - Developer Portable Work Reports (F4-013)
*/
async function handleBootstrapPhase4Data() {
	try {
		const [dbSubscriptions, dbSaasInvoices, dbUsageRecords, dbApiKeys, dbWebhookEndpoints, dbWebhookDeliveries, dbConnectors, dbCalendarMeetings, dbPortableReports] = await Promise.all([
			prisma.subscriptionAccount.findMany({ orderBy: { createdAt: "asc" } }),
			prisma.saasSubscriptionInvoice.findMany({
				orderBy: { issuedAt: "desc" },
				take: 100
			}),
			prisma.usageRecord.findMany({
				orderBy: { metricDate: "desc" },
				take: 60
			}),
			prisma.apiKey.findMany({
				orderBy: { createdAt: "desc" },
				take: 50
			}),
			prisma.outboundWebhookEndpoint.findMany({
				orderBy: { createdAt: "desc" },
				take: 50
			}),
			prisma.outboundWebhookDelivery.findMany({
				orderBy: { createdAt: "desc" },
				take: 100
			}),
			prisma.ecosystemConnector.findMany({ orderBy: { createdAt: "asc" } }),
			prisma.calendarMeetingEvent.findMany({
				orderBy: { startedAtUtc: "desc" },
				take: 60
			}),
			prisma.portableWorkReport.findMany({
				include: { developer: true },
				orderBy: { createdAt: "desc" },
				take: 50
			})
		]);
		return {
			subscriptions: dbSubscriptions.map((s) => ({
				id: s.id,
				tenantId: s.tenantId,
				planTier: s.planTier,
				billingProvider: s.billingProvider,
				providerCustomerId: s.providerCustomerId ?? void 0,
				providerSubscriptionId: s.providerSubscriptionId ?? void 0,
				status: s.status,
				billingCycle: s.billingCycle,
				trialEndsAt: s.trialEndsAt ? s.trialEndsAt.toISOString() : void 0,
				currentPeriodStart: s.currentPeriodStart.toISOString(),
				currentPeriodEnd: s.currentPeriodEnd.toISOString(),
				cancelAtPeriodEnd: s.cancelAtPeriodEnd,
				seatLimitOverride: s.seatLimitOverride ?? void 0
			})),
			saasInvoices: dbSaasInvoices.map((inv) => ({
				id: inv.id,
				tenantId: inv.tenantId,
				subscriptionAccountId: inv.subscriptionAccountId,
				invoiceNumber: inv.invoiceNumber,
				billingPeriodLabel: inv.billingPeriodLabel,
				planTier: inv.planTier,
				seatsBilled: inv.seatsBilled,
				unitPriceCents: inv.unitPriceCents,
				subtotalCents: inv.subtotalCents,
				taxCents: inv.taxCents,
				totalCents: inv.totalCents,
				currency: inv.currency,
				status: inv.status,
				providerInvoiceId: inv.providerInvoiceId ?? void 0,
				issuedAt: inv.issuedAt.toISOString(),
				paidAt: inv.paidAt ? inv.paidAt.toISOString() : void 0
			})),
			usageRecords: dbUsageRecords.map((u) => ({
				id: u.id,
				tenantId: u.tenantId,
				metricDate: u.metricDate.toISOString().slice(0, 10),
				activeSeats: u.activeSeats,
				activeProjects: u.activeProjects,
				activityEventsCount: Number(u.activityEventsCount),
				storageBytes: Number(u.storageBytes),
				aiTokensUsed: Number(u.aiTokensUsed),
				apiRequestsCount: Number(u.apiRequestsCount),
				webhookDeliveriesCount: Number(u.webhookDeliveriesCount)
			})),
			apiKeys: dbApiKeys.map((k) => ({
				id: k.id,
				tenantId: k.tenantId,
				name: k.name,
				keyPrefix: k.keyPrefix,
				keyHashSha256: k.keyHashSha256,
				scopes: k.scopes,
				rateLimitPerMin: k.rateLimitPerMin,
				lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : void 0,
				expiresAt: k.expiresAt ? k.expiresAt.toISOString() : void 0,
				revokedAt: k.revokedAt ? k.revokedAt.toISOString() : void 0,
				createdAt: k.createdAt.toISOString()
			})),
			webhookEndpoints: dbWebhookEndpoints.map((ep) => ({
				id: ep.id,
				tenantId: ep.tenantId,
				name: ep.name,
				targetUrl: ep.targetUrl,
				signingSecretPrefix: ep.signingSecretPrefix,
				subscribedEvents: ep.subscribedEvents,
				isActive: ep.isActive,
				createdAt: ep.createdAt.toISOString()
			})),
			webhookDeliveries: dbWebhookDeliveries.map((d) => ({
				id: d.id,
				tenantId: d.tenantId,
				endpointId: d.endpointId,
				eventType: d.eventType,
				eventId: d.eventId,
				signatureHeader: d.signatureHeader,
				deliveryStatus: d.deliveryStatus,
				httpStatus: d.httpStatus ?? void 0,
				attemptCount: d.attemptCount,
				responseSnippet: d.responseSnippet ?? void 0,
				createdAt: d.createdAt.toISOString()
			})),
			connectors: dbConnectors.map((c) => ({
				id: c.id,
				tenantId: c.tenantId,
				category: c.category,
				provider: c.provider,
				displayName: c.displayName,
				status: c.status,
				syncConfig: c.syncConfig ?? {},
				lastSyncedAt: c.lastSyncedAt ? c.lastSyncedAt.toISOString() : void 0,
				createdAt: c.createdAt.toISOString()
			})),
			calendarMeetings: dbCalendarMeetings.map((m) => ({
				id: m.id,
				tenantId: m.tenantId,
				userId: m.userId,
				projectId: m.projectId ?? void 0,
				taskId: m.taskId ?? void 0,
				connectorId: m.connectorId ?? void 0,
				externalEventId: m.externalEventId,
				meetingTitleSanitized: m.meetingTitleSanitized,
				startedAtUtc: m.startedAtUtc.toISOString(),
				endedAtUtc: m.endedAtUtc.toISOString(),
				durationMinutes: m.durationMinutes,
				associatedSegmentId: m.associatedSegmentId ?? void 0,
				syncPermissionScope: m.syncPermissionScope
			})),
			portableReports: dbPortableReports.map((r) => ({
				id: r.id,
				tenantId: r.tenantId,
				developerUserId: r.developerUserId,
				developerName: r.developer.fullName,
				reportTitle: r.reportTitle,
				periodStart: r.periodStart.toISOString().slice(0, 10),
				periodEnd: r.periodEnd.toISOString().slice(0, 10),
				totalApprovedMinutes: Number(r.totalApprovedMinutes),
				totalSupportedMinutes: Number(r.totalSupportedMinutes),
				deliverablesCount: r.deliverablesCount,
				payloadDigestSha256: r.payloadDigestSha256,
				signatureHmacSha256: r.signatureHmacSha256,
				reportPayload: r.reportPayload ?? {},
				createdAt: r.createdAt.toISOString()
			}))
		};
	} catch {
		return {
			subscriptions: [],
			saasInvoices: [],
			usageRecords: [],
			apiKeys: [],
			webhookEndpoints: [],
			webhookDeliveries: [],
			connectors: [],
			calendarMeetings: [],
			portableReports: []
		};
	}
}
async function handleCheckoutSubscriptionPrisma(body) {
	if (!isValidUuid(body.tenantId)) return { ok: false };
	return {
		ok: true,
		...await prisma.$transaction(async (tx) => {
			const sub = await tx.subscriptionAccount.upsert({
				where: { tenantId: body.tenantId },
				update: {
					planTier: body.planTier,
					billingProvider: body.billingProvider,
					billingCycle: body.billingCycle,
					status: "active",
					updatedAt: /* @__PURE__ */ new Date()
				},
				create: {
					tenantId: body.tenantId,
					planTier: body.planTier,
					billingProvider: body.billingProvider,
					billingCycle: body.billingCycle,
					status: "active",
					providerCustomerId: `cus_${body.tenantId.slice(0, 8)}`,
					providerSubscriptionId: `sub_${body.tenantId.slice(0, 8)}`
				}
			});
			await tx.tenant.update({
				where: { id: body.tenantId },
				data: { planTier: body.planTier }
			});
			const saasInvoice = await tx.saasSubscriptionInvoice.create({ data: {
				tenantId: body.tenantId,
				subscriptionAccountId: sub.id,
				invoiceNumber: body.invoiceNumber,
				billingPeriodLabel: body.billingPeriodLabel,
				planTier: body.planTier,
				seatsBilled: body.seatsBilled,
				unitPriceCents: body.unitPriceCents,
				subtotalCents: body.subtotalCents,
				taxCents: 0,
				totalCents: body.totalCents,
				currency: body.currency,
				status: "paid",
				paidAt: /* @__PURE__ */ new Date()
			} });
			await tx.auditEntry.create({ data: {
				tenantId: body.tenantId,
				actorUserId: isValidUuid(body.actorUserId) ? body.actorUserId : null,
				actionType: "SAAS_SUBSCRIPTION_UPDATED",
				targetEntity: `subscription_accounts:${sub.id}`,
				reason: `Upgraded/synced ${body.billingProvider} subscription to ${body.planTier} (${body.billingCycle}).`
			} });
			return {
				subId: sub.id,
				invoiceId: saasInvoice.id
			};
		})
	};
}
async function handleUpdateBrandingPrisma(body) {
	if (!isValidUuid(body.tenantId)) return { ok: false };
	await prisma.$transaction(async (tx) => {
		await tx.tenantSettings.update({
			where: { tenantId: body.tenantId },
			data: { brandingConfig: body.brandingConfig }
		});
		await tx.auditEntry.create({ data: {
			tenantId: body.tenantId,
			actorUserId: isValidUuid(body.actorUserId) ? body.actorUserId : null,
			actionType: "WHITE_LABEL_BRANDING_UPDATED",
			targetEntity: `tenant_settings:${body.tenantId}`,
			reason: `Updated agency portal branding for "${body.brandingConfig.agencyBrandName}".`
		} });
	});
	return { ok: true };
}
async function handleCreateApiKeyPrisma(body) {
	if (!isValidUuid(body.tenantId)) return { ok: false };
	return {
		ok: true,
		id: (await prisma.apiKey.create({ data: {
			tenantId: body.tenantId,
			name: body.name,
			keyPrefix: body.keyPrefix,
			keyHashSha256: body.keyHashSha256,
			scopes: body.scopes,
			rateLimitPerMin: body.rateLimitPerMin,
			createdBy: isValidUuid(body.createdBy) ? body.createdBy : null
		} })).id
	};
}
async function handleRevokeApiKeyPrisma(body) {
	if (!isValidUuid(body.tenantId) || !isValidUuid(body.keyId)) return { ok: false };
	await prisma.apiKey.updateMany({
		where: {
			id: body.keyId,
			tenantId: body.tenantId
		},
		data: { revokedAt: /* @__PURE__ */ new Date() }
	});
	return { ok: true };
}
async function handleCreateWebhookEndpointPrisma(body) {
	if (!isValidUuid(body.tenantId)) return { ok: false };
	return {
		ok: true,
		id: (await prisma.outboundWebhookEndpoint.create({ data: {
			tenantId: body.tenantId,
			name: body.name,
			targetUrl: body.targetUrl,
			signingSecretPrefix: body.signingSecretPrefix,
			signingSecretHash: body.signingSecretHash,
			subscribedEvents: body.subscribedEvents,
			createdBy: isValidUuid(body.createdBy) ? body.createdBy : null
		} })).id
	};
}
async function handleDispatchWebhookDeliveryPrisma(body) {
	if (!isValidUuid(body.tenantId) || !isValidUuid(body.endpointId)) return { ok: false };
	return {
		ok: true,
		id: (await prisma.outboundWebhookDelivery.create({ data: {
			tenantId: body.tenantId,
			endpointId: body.endpointId,
			eventType: body.eventType,
			eventId: isValidUuid(body.eventId) ? body.eventId : crypto.randomUUID(),
			payload: body.payload,
			signatureHeader: body.signatureHeader,
			deliveryStatus: "delivered",
			httpStatus: 202,
			attemptCount: 1,
			lastAttemptAt: /* @__PURE__ */ new Date(),
			responseSnippet: body.responseSnippet
		} })).id
	};
}
async function handleUpsertConnectorPrisma(body) {
	if (!isValidUuid(body.tenantId)) return { ok: false };
	return {
		ok: true,
		id: (await prisma.ecosystemConnector.upsert({
			where: { tenantId_provider: {
				tenantId: body.tenantId,
				provider: body.provider
			} },
			update: {
				status: body.status,
				displayName: body.displayName,
				syncConfig: body.syncConfig,
				lastSyncedAt: body.status === "connected" ? /* @__PURE__ */ new Date() : void 0,
				updatedAt: /* @__PURE__ */ new Date()
			},
			create: {
				tenantId: body.tenantId,
				category: body.category,
				provider: body.provider,
				displayName: body.displayName,
				status: body.status,
				syncConfig: body.syncConfig,
				lastSyncedAt: /* @__PURE__ */ new Date(),
				connectedBy: isValidUuid(body.connectedBy) ? body.connectedBy : null
			}
		})).id
	};
}
async function handleSyncCalendarMeetingPrisma(body) {
	if (!isValidUuid(body.tenantId) || !isValidUuid(body.userId)) return { ok: false };
	return {
		ok: true,
		id: (await prisma.calendarMeetingEvent.upsert({
			where: { tenantId_userId_externalEventId: {
				tenantId: body.tenantId,
				userId: body.userId,
				externalEventId: body.externalEventId
			} },
			update: {
				meetingTitleSanitized: body.meetingTitleSanitized,
				durationMinutes: body.durationMinutes
			},
			create: {
				tenantId: body.tenantId,
				userId: body.userId,
				projectId: isValidUuid(body.projectId) ? body.projectId : null,
				taskId: isValidUuid(body.taskId) ? body.taskId : null,
				connectorId: isValidUuid(body.connectorId) ? body.connectorId : null,
				externalEventId: body.externalEventId,
				meetingTitleSanitized: body.meetingTitleSanitized,
				startedAtUtc: new Date(body.startedAtUtc),
				endedAtUtc: new Date(body.endedAtUtc),
				durationMinutes: body.durationMinutes,
				syncPermissionScope: body.syncPermissionScope
			}
		})).id
	};
}
async function handleCreatePortableReportPrisma(body) {
	if (!isValidUuid(body.tenantId) || !isValidUuid(body.developerUserId)) return { ok: false };
	return {
		ok: true,
		id: (await prisma.portableWorkReport.create({ data: {
			tenantId: body.tenantId,
			developerUserId: body.developerUserId,
			reportTitle: body.reportTitle,
			periodStart: new Date(body.periodStart),
			periodEnd: new Date(body.periodEnd),
			totalApprovedMinutes: body.totalApprovedMinutes,
			totalSupportedMinutes: body.totalSupportedMinutes,
			deliverablesCount: body.deliverablesCount,
			payloadDigestSha256: body.payloadDigestSha256,
			signatureHmacSha256: body.signatureHmacSha256,
			reportPayload: body.reportPayload
		} })).id
	};
}
// src/server/prismaPhase5Handlers.ts
/**
* DevProof (TikTrack) - Prisma ORM Phase 5 Handlers
*
* Persists Phase 5 Enterprise, Compliance & Operational Scale workflows in
* Supabase PostgreSQL:
*  - SAML/OIDC SSO Providers & SCIM 2.0 Provisioning Events (F5-001)
*  - Two-Person Policy Change Governance (F5-006)
*  - Legal Holds, Retention Policies/Jobs, DSAR Privacy Requests & Access Logs (F5-002)
*  - Data Residency & Tenant Isolation Configs (F5-003, F5-004)
*  - SIEM Destinations & Sanitized Export Batches (F5-005)
*  - Signed Desktop Fleet Releases & Warehouse Exports (F5-007, F5-008)
*  - DR/Load Exercises, Security Assessments & Accessibility/Locale Configs (F5-009..F5-011)
*/
async function handleBootstrapPhase5Data() {
	try {
		const [dbSsoProviders, dbScimEvents, dbPolicyChangeRequests, dbSensitiveLogs, dbLegalHolds, dbRetentionPolicies, dbRetentionJobs, dbPrivacyRequests, dbResidencyConfigs, dbSiemDestinations, dbSiemBatches, dbFleetReleases, dbWarehouseExports, dbDrExercises, dbSecurityAssessments, dbAccessibilityConfigs] = await Promise.all([
			prisma.ssoProvider.findMany({ orderBy: { createdAt: "desc" } }),
			prisma.scimProvisioningEvent.findMany({
				orderBy: { occurredAtUtc: "desc" },
				take: 50
			}),
			prisma.policyChangeRequest.findMany({
				include: {
					proposer: true,
					firstApprover: true,
					secondApprover: true
				},
				orderBy: { createdAt: "desc" },
				take: 40
			}),
			prisma.sensitiveAccessLog.findMany({
				include: { actorUser: true },
				orderBy: { occurredAtUtc: "desc" },
				take: 80
			}),
			prisma.legalHold.findMany({
				orderBy: { placedAt: "desc" },
				take: 50
			}),
			prisma.retentionPolicy.findMany({ orderBy: { createdAt: "desc" } }),
			prisma.retentionJob.findMany({
				orderBy: { executedAtUtc: "desc" },
				take: 50
			}),
			prisma.privacyRequest.findMany({
				include: { requester: true },
				orderBy: { createdAt: "desc" },
				take: 50
			}),
			prisma.tenantResidencyConfig.findMany(),
			prisma.siemDestination.findMany({ orderBy: { createdAt: "desc" } }),
			prisma.siemExportBatch.findMany({
				orderBy: { createdAt: "desc" },
				take: 50
			}),
			prisma.fleetRelease.findMany({
				orderBy: { createdAt: "desc" },
				take: 40
			}),
			prisma.analyticsWarehouseExport.findMany({
				orderBy: { createdAt: "desc" },
				take: 40
			}),
			prisma.drExercise.findMany({
				orderBy: { conductedAt: "desc" },
				take: 40
			}),
			prisma.securityAssessment.findMany({
				orderBy: { assessedAt: "desc" },
				take: 40
			}),
			prisma.tenantAccessibilityConfig.findMany()
		]);
		return {
			ssoProviders: dbSsoProviders.map((p) => ({
				id: p.id,
				tenantId: p.tenantId,
				providerType: p.providerType,
				displayName: p.displayName,
				domain: p.domain,
				entityIdOrIssuer: p.entityIdOrIssuer,
				ssoUrl: p.ssoUrl,
				certificateFingerprint: p.certificateFingerprint ?? void 0,
				clientId: p.clientId ?? void 0,
				enforceSso: p.enforceSso,
				jitDefaultRole: p.jitDefaultRole,
				scimEnabled: p.scimEnabled,
				scimTokenPrefix: p.scimTokenPrefix ?? void 0,
				status: p.status,
				createdAt: p.createdAt.toISOString()
			})),
			scimEvents: dbScimEvents.map((e) => ({
				id: e.id,
				tenantId: e.tenantId,
				providerId: e.providerId ?? void 0,
				action: e.action,
				externalUserId: e.externalUserId,
				email: e.email,
				targetRole: e.targetRole,
				status: e.status,
				correlationId: e.correlationId,
				detailMessage: e.detailMessage ?? void 0,
				occurredAtUtc: e.occurredAtUtc.toISOString()
			})),
			policyChangeRequests: dbPolicyChangeRequests.map((r) => ({
				id: r.id,
				tenantId: r.tenantId,
				proposedVersionCode: r.proposedVersionCode,
				changeSummary: r.changeSummary,
				scopeDiff: r.scopeDiff ?? {},
				expandsCollectionScope: r.expandsCollectionScope,
				status: r.status,
				proposedBy: r.proposedBy,
				proposedByName: r.proposer.fullName,
				approvedByFirst: r.approvedByFirst,
				approvedByFirstName: r.firstApprover.fullName,
				approvedBySecond: r.approvedBySecond ?? void 0,
				approvedBySecondName: r.secondApprover?.fullName ?? void 0,
				rejectionReason: r.rejectionReason ?? void 0,
				effectiveFrom: r.effectiveFrom.toISOString(),
				activatedPolicyVersionId: r.activatedPolicyVersionId ?? void 0,
				createdAt: r.createdAt.toISOString(),
				resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : void 0
			})),
			sensitiveAccessLogs: dbSensitiveLogs.map((l) => ({
				id: l.id,
				tenantId: l.tenantId,
				actorUserId: l.actorUserId ?? void 0,
				actorName: l.actorUser?.fullName ?? void 0,
				actionCategory: l.actionCategory,
				resourceType: l.resourceType,
				resourceId: l.resourceId,
				ipAddressMasked: l.ipAddressMasked,
				correlationId: l.correlationId,
				metadata: l.metadata ?? {},
				occurredAtUtc: l.occurredAtUtc.toISOString()
			})),
			legalHolds: dbLegalHolds.map((h) => ({
				id: h.id,
				tenantId: h.tenantId,
				scopeType: h.scopeType,
				targetId: h.targetId,
				reason: h.reason,
				holdStatus: h.holdStatus,
				placedBy: h.placedBy ?? void 0,
				releasedBy: h.releasedBy ?? void 0,
				placedAt: h.placedAt.toISOString(),
				releasedAt: h.releasedAt ? h.releasedAt.toISOString() : void 0
			})),
			retentionPolicies: dbRetentionPolicies.map((rp) => ({
				id: rp.id,
				tenantId: rp.tenantId,
				name: rp.name,
				rawActivityDays: rp.rawActivityDays,
				rollupDays: rp.rollupDays,
				evidenceArtifactDays: rp.evidenceArtifactDays,
				auditLogDays: rp.auditLogDays,
				archiveStorageTier: rp.archiveStorageTier,
				isActive: rp.isActive,
				createdAt: rp.createdAt.toISOString()
			})),
			retentionJobs: dbRetentionJobs.map((rj) => ({
				id: rj.id,
				tenantId: rj.tenantId,
				policyId: rj.policyId ?? void 0,
				jobType: rj.jobType,
				status: rj.status,
				scannedCount: rj.scannedCount,
				purgedCount: rj.purgedCount,
				skippedLegalHoldCount: rj.skippedLegalHoldCount,
				archivedBundleUri: rj.archivedBundleUri ?? void 0,
				executedAtUtc: rj.executedAtUtc.toISOString()
			})),
			privacyRequests: dbPrivacyRequests.map((pr) => ({
				id: pr.id,
				tenantId: pr.tenantId,
				requesterUserId: pr.requesterUserId,
				requesterName: pr.requester.fullName,
				requestType: pr.requestType,
				status: pr.status,
				legalHoldBlocked: pr.legalHoldBlocked,
				exportDigestSha256: pr.exportDigestSha256 ?? void 0,
				resolutionNote: pr.resolutionNote ?? void 0,
				createdAt: pr.createdAt.toISOString(),
				resolvedAt: pr.resolvedAt ? pr.resolvedAt.toISOString() : void 0
			})),
			residencyConfigs: dbResidencyConfigs.map((rc) => ({
				tenantId: rc.tenantId,
				primaryRegion: rc.primaryRegion,
				failoverRegion: rc.failoverRegion,
				dataResidencyLocked: rc.dataResidencyLocked,
				isolationTier: rc.isolationTier,
				encryptionKeyMode: rc.encryptionKeyMode,
				kmsKeyArnMasked: rc.kmsKeyArnMasked ?? void 0,
				dedicatedWorkerPool: rc.dedicatedWorkerPool,
				egressAllowlistCidrs: rc.egressAllowlistCidrs,
				updatedAt: rc.updatedAt.toISOString()
			})),
			siemDestinations: dbSiemDestinations.map((d) => ({
				id: d.id,
				tenantId: d.tenantId,
				name: d.name,
				provider: d.provider,
				endpointUrl: d.endpointUrl,
				authHeaderPrefix: d.authHeaderPrefix,
				format: d.format,
				includeCategories: d.includeCategories,
				isActive: d.isActive,
				lastExportedAt: d.lastExportedAt ? d.lastExportedAt.toISOString() : void 0,
				createdAt: d.createdAt.toISOString()
			})),
			siemBatches: dbSiemBatches.map((b) => ({
				id: b.id,
				tenantId: b.tenantId,
				destinationId: b.destinationId,
				eventCount: b.eventCount,
				payloadFormat: b.payloadFormat,
				payloadDigestSha256: b.payloadDigestSha256,
				deliveryStatus: b.deliveryStatus,
				httpStatus: b.httpStatus ?? void 0,
				sanitizedPreview: b.sanitizedPreview ?? {},
				createdAt: b.createdAt.toISOString()
			})),
			fleetReleases: dbFleetReleases.map((fr) => ({
				id: fr.id,
				tenantId: fr.tenantId,
				version: fr.version,
				platform: fr.platform,
				channel: fr.channel,
				installerSha256: fr.installerSha256,
				codeSigningThumbprint: fr.codeSigningThumbprint,
				notarizationStatus: fr.notarizationStatus,
				minOsVersion: fr.minOsVersion,
				rolloutPercentage: fr.rolloutPercentage,
				releaseNotes: fr.releaseNotes,
				isActive: fr.isActive,
				createdAt: fr.createdAt.toISOString()
			})),
			warehouseExports: dbWarehouseExports.map((we) => ({
				id: we.id,
				tenantId: we.tenantId,
				targetSink: we.targetSink,
				periodStart: we.periodStart.toISOString().slice(0, 10),
				periodEnd: we.periodEnd.toISOString().slice(0, 10),
				rowCount: we.rowCount,
				compressedBytes: Number(we.compressedBytes),
				objectPathUri: we.objectPathUri,
				checksumSha256: we.checksumSha256,
				status: we.status,
				createdAt: we.createdAt.toISOString()
			})),
			drExercises: dbDrExercises.map((dr) => ({
				id: dr.id,
				tenantId: dr.tenantId,
				exerciseType: dr.exerciseType,
				targetRpoMinutes: dr.targetRpoMinutes,
				measuredRpoMinutes: dr.measuredRpoMinutes,
				targetRtoMinutes: dr.targetRtoMinutes,
				measuredRtoMinutes: dr.measuredRtoMinutes,
				p95CrudMs: dr.p95CrudMs,
				simulatedConcurrentDevs: dr.simulatedConcurrentDevs,
				passed: dr.passed,
				findingsSummary: dr.findingsSummary,
				conductedAt: dr.conductedAt.toISOString()
			})),
			securityAssessments: dbSecurityAssessments.map((sa) => ({
				id: sa.id,
				tenantId: sa.tenantId,
				assessmentName: sa.assessmentName,
				assessorFirm: sa.assessorFirm,
				assessmentType: sa.assessmentType,
				status: sa.status,
				criticalFindings: sa.criticalFindings,
				highFindings: sa.highFindings,
				remediatedFindings: sa.remediatedFindings,
				reportSha256: sa.reportSha256 ?? void 0,
				assessedAt: sa.assessedAt.toISOString(),
				signoffAt: sa.signoffAt ? sa.signoffAt.toISOString() : void 0
			})),
			accessibilityConfigs: dbAccessibilityConfigs.map((ac) => ({
				tenantId: ac.tenantId,
				defaultLocale: ac.defaultLocale,
				highContrastMode: ac.highContrastMode,
				keyboardShortcutsEnabled: ac.keyboardShortcutsEnabled,
				wcagTargetLevel: ac.wcagTargetLevel,
				updatedAt: ac.updatedAt.toISOString()
			}))
		};
	} catch {
		return {
			ssoProviders: [],
			scimEvents: [],
			policyChangeRequests: [],
			sensitiveAccessLogs: [],
			legalHolds: [],
			retentionPolicies: [],
			retentionJobs: [],
			privacyRequests: [],
			residencyConfigs: [],
			siemDestinations: [],
			siemBatches: [],
			fleetReleases: [],
			warehouseExports: [],
			drExercises: [],
			securityAssessments: [],
			accessibilityConfigs: []
		};
	}
}
async function handleUpsertSsoProviderPrisma(input) {
	if (!isValidUuid(input.tenantId)) return { ok: false };
	const createdBy = isValidUuid(input.createdBy) ? input.createdBy : void 0;
	return {
		ok: true,
		id: (await prisma.ssoProvider.upsert({
			where: { tenantId_domain: {
				tenantId: input.tenantId,
				domain: input.domain.toLowerCase()
			} },
			update: {
				providerType: input.providerType,
				displayName: input.displayName,
				entityIdOrIssuer: input.entityIdOrIssuer,
				ssoUrl: input.ssoUrl,
				certificateFingerprint: input.certificateFingerprint,
				clientId: input.clientId,
				enforceSso: input.enforceSso,
				jitDefaultRole: input.jitDefaultRole,
				scimEnabled: input.scimEnabled,
				...input.scimTokenPrefix ? { scimTokenPrefix: input.scimTokenPrefix } : {},
				...input.scimTokenHashSha256 ? { scimTokenHashSha256: input.scimTokenHashSha256 } : {},
				status: "active"
			},
			create: {
				tenantId: input.tenantId,
				providerType: input.providerType,
				displayName: input.displayName,
				domain: input.domain.toLowerCase(),
				entityIdOrIssuer: input.entityIdOrIssuer,
				ssoUrl: input.ssoUrl,
				certificateFingerprint: input.certificateFingerprint,
				clientId: input.clientId,
				enforceSso: input.enforceSso,
				jitDefaultRole: input.jitDefaultRole,
				scimEnabled: input.scimEnabled,
				scimTokenPrefix: input.scimTokenPrefix,
				scimTokenHashSha256: input.scimTokenHashSha256,
				status: "active",
				createdBy
			}
		})).id
	};
}
async function handleRecordScimEventPrisma(input) {
	if (!isValidUuid(input.tenantId)) return { ok: false };
	return {
		ok: true,
		id: (await prisma.$transaction(async (tx) => {
			const created = await tx.scimProvisioningEvent.create({ data: {
				tenantId: input.tenantId,
				providerId: isValidUuid(input.providerId) ? input.providerId : void 0,
				action: input.action,
				externalUserId: input.externalUserId,
				email: input.email.toLowerCase(),
				targetRole: input.targetRole,
				status: "applied",
				correlationId: input.correlationId,
				detailMessage: input.detailMessage
			} });
			await tx.sensitiveAccessLog.create({ data: {
				tenantId: input.tenantId,
				actionCategory: "scim_sync",
				resourceType: "scim_provisioning_events",
				resourceId: created.id,
				correlationId: input.correlationId,
				metadata: {
					action: input.action,
					targetRole: input.targetRole
				}
			} });
			return created;
		})).id
	};
}
async function handleProposePolicyChangePrisma(input) {
	if (!isValidUuid(input.tenantId) || !isValidUuid(input.proposedBy)) return { ok: false };
	return {
		ok: true,
		id: (await prisma.policyChangeRequest.create({ data: {
			tenantId: input.tenantId,
			proposedVersionCode: input.proposedVersionCode,
			changeSummary: input.changeSummary,
			scopeDiff: input.scopeDiff,
			expandsCollectionScope: input.expandsCollectionScope,
			status: "pending_second_approval",
			proposedBy: input.proposedBy,
			approvedByFirst: input.proposedBy,
			effectiveFrom: new Date(input.effectiveFrom)
		} })).id
	};
}
async function handleApprovePolicyChangeSecondPrisma(input) {
	if (!isValidUuid(input.tenantId) || !isValidUuid(input.requestId) || !isValidUuid(input.secondApproverId)) return {
		ok: false,
		error: "Invalid UUID supplied."
	};
	const req = await prisma.policyChangeRequest.findFirst({ where: {
		id: input.requestId,
		tenantId: input.tenantId
	} });
	if (!req) return {
		ok: false,
		error: "Policy change request not found."
	};
	if (req.proposedBy === input.secondApproverId || req.approvedByFirst === input.secondApproverId) return {
		ok: false,
		error: "Two-person governance violation: second approver must be a distinct administrator."
	};
	const now = /* @__PURE__ */ new Date();
	if (input.decision === "reject") {
		await prisma.policyChangeRequest.update({
			where: { id: req.id },
			data: {
				status: "rejected",
				approvedBySecond: input.secondApproverId,
				rejectionReason: input.rejectionReason ?? "Rejected during dual-control review.",
				resolvedAt: now
			}
		});
		return { ok: true };
	}
	const effectiveFrom = req.effectiveFrom > now ? req.effectiveFrom : now;
	return {
		ok: true,
		activatedPolicyVersionId: await prisma.$transaction(async (tx) => {
			const pv = await tx.policyVersion.create({ data: {
				tenantId: input.tenantId,
				versionCode: req.proposedVersionCode,
				effectiveFrom,
				captureScope: req.scopeDiff,
				summaryMarkdown: req.changeSummary,
				publishedBy: input.secondApproverId
			} });
			await tx.policyChangeRequest.update({
				where: { id: req.id },
				data: {
					status: "approved_activated",
					approvedBySecond: input.secondApproverId,
					activatedPolicyVersionId: pv.id,
					effectiveFrom,
					resolvedAt: now
				}
			});
			await tx.sensitiveAccessLog.create({ data: {
				tenantId: input.tenantId,
				actorUserId: input.secondApproverId,
				actionCategory: "policy_approval",
				resourceType: "policy_change_requests",
				resourceId: req.id,
				correlationId: `pol-${req.id.slice(0, 8)}`,
				metadata: {
					versionCode: req.proposedVersionCode,
					effectiveFrom: effectiveFrom.toISOString()
				}
			} });
			return pv.id;
		})
	};
}
async function handleCreateLegalHoldPrisma(input) {
	if (!isValidUuid(input.tenantId)) return { ok: false };
	const placedBy = isValidUuid(input.placedBy) ? input.placedBy : void 0;
	return {
		ok: true,
		id: (await prisma.$transaction(async (tx) => {
			const created = await tx.legalHold.create({ data: {
				tenantId: input.tenantId,
				scopeType: input.scopeType,
				targetId: input.targetId,
				reason: input.reason,
				holdStatus: "active",
				placedBy
			} });
			await tx.sensitiveAccessLog.create({ data: {
				tenantId: input.tenantId,
				actorUserId: placedBy,
				actionCategory: "legal_hold_change",
				resourceType: "legal_holds",
				resourceId: created.id,
				correlationId: `hold-${created.id.slice(0, 8)}`,
				metadata: {
					scopeType: input.scopeType,
					action: "placed"
				}
			} });
			return created;
		})).id
	};
}
async function handleReleaseLegalHoldPrisma(input) {
	if (!isValidUuid(input.tenantId) || !isValidUuid(input.holdId)) return { ok: false };
	const releasedBy = isValidUuid(input.releasedBy) ? input.releasedBy : void 0;
	await prisma.legalHold.update({
		where: { id: input.holdId },
		data: {
			holdStatus: "released",
			releasedBy,
			releasedAt: /* @__PURE__ */ new Date()
		}
	});
	return { ok: true };
}
async function handleUpsertRetentionPolicyPrisma(input) {
	if (!isValidUuid(input.tenantId)) return { ok: false };
	const createdBy = isValidUuid(input.createdBy) ? input.createdBy : void 0;
	return {
		ok: true,
		id: (await prisma.retentionPolicy.upsert({
			where: { tenantId_name: {
				tenantId: input.tenantId,
				name: input.name
			} },
			update: {
				rawActivityDays: input.rawActivityDays,
				rollupDays: input.rollupDays,
				evidenceArtifactDays: input.evidenceArtifactDays,
				auditLogDays: input.auditLogDays,
				archiveStorageTier: input.archiveStorageTier,
				isActive: true
			},
			create: {
				tenantId: input.tenantId,
				name: input.name,
				rawActivityDays: input.rawActivityDays,
				rollupDays: input.rollupDays,
				evidenceArtifactDays: input.evidenceArtifactDays,
				auditLogDays: input.auditLogDays,
				archiveStorageTier: input.archiveStorageTier,
				isActive: true,
				createdBy
			}
		})).id
	};
}
async function handleRecordRetentionJobPrisma(input) {
	if (!isValidUuid(input.tenantId)) return { ok: false };
	const executedBy = isValidUuid(input.executedBy) ? input.executedBy : void 0;
	return {
		ok: true,
		id: (await prisma.retentionJob.create({ data: {
			tenantId: input.tenantId,
			policyId: isValidUuid(input.policyId) ? input.policyId : void 0,
			jobType: input.jobType,
			status: input.status,
			scannedCount: input.scannedCount,
			purgedCount: input.purgedCount,
			skippedLegalHoldCount: input.skippedLegalHoldCount,
			archivedBundleUri: input.archivedBundleUri,
			executedBy
		} })).id
	};
}
async function handleCreatePrivacyRequestPrisma(input) {
	if (!isValidUuid(input.tenantId) || !isValidUuid(input.requesterUserId)) return { ok: false };
	return {
		ok: true,
		id: (await prisma.privacyRequest.create({ data: {
			tenantId: input.tenantId,
			requesterUserId: input.requesterUserId,
			requestType: input.requestType,
			status: input.status,
			legalHoldBlocked: input.legalHoldBlocked,
			exportDigestSha256: input.exportDigestSha256,
			resolutionNote: input.resolutionNote,
			resolvedAt: input.status === "completed" ? /* @__PURE__ */ new Date() : void 0
		} })).id
	};
}
async function handleUpsertResidencyConfigPrisma(input) {
	if (!isValidUuid(input.tenantId)) return { ok: false };
	const updatedBy = isValidUuid(input.updatedBy) ? input.updatedBy : void 0;
	await prisma.$transaction(async (tx) => {
		await tx.tenantResidencyConfig.upsert({
			where: { tenantId: input.tenantId },
			update: {
				primaryRegion: input.primaryRegion,
				failoverRegion: input.failoverRegion,
				dataResidencyLocked: input.dataResidencyLocked,
				isolationTier: input.isolationTier,
				encryptionKeyMode: input.encryptionKeyMode,
				kmsKeyArnMasked: input.kmsKeyArnMasked,
				dedicatedWorkerPool: input.dedicatedWorkerPool,
				egressAllowlistCidrs: input.egressAllowlistCidrs,
				updatedBy
			},
			create: {
				tenantId: input.tenantId,
				primaryRegion: input.primaryRegion,
				failoverRegion: input.failoverRegion,
				dataResidencyLocked: input.dataResidencyLocked,
				isolationTier: input.isolationTier,
				encryptionKeyMode: input.encryptionKeyMode,
				kmsKeyArnMasked: input.kmsKeyArnMasked,
				dedicatedWorkerPool: input.dedicatedWorkerPool,
				egressAllowlistCidrs: input.egressAllowlistCidrs,
				updatedBy
			}
		});
		await tx.sensitiveAccessLog.create({ data: {
			tenantId: input.tenantId,
			actorUserId: updatedBy,
			actionCategory: "residency_change",
			resourceType: "tenant_residency_configs",
			resourceId: input.tenantId,
			correlationId: `res-${Date.now()}`,
			metadata: {
				primaryRegion: input.primaryRegion,
				isolationTier: input.isolationTier,
				dataResidencyLocked: input.dataResidencyLocked
			}
		} });
	});
	return { ok: true };
}
async function handleCreateSiemDestinationPrisma(input) {
	if (!isValidUuid(input.tenantId)) return { ok: false };
	const createdBy = isValidUuid(input.createdBy) ? input.createdBy : void 0;
	return {
		ok: true,
		id: (await prisma.siemDestination.create({ data: {
			tenantId: input.tenantId,
			name: input.name,
			provider: input.provider,
			endpointUrl: input.endpointUrl,
			authHeaderPrefix: input.authHeaderPrefix,
			authTokenHashSha256: input.authTokenHashSha256,
			format: input.format,
			includeCategories: input.includeCategories,
			createdBy
		} })).id
	};
}
async function handleRecordSiemBatchPrisma(input) {
	if (!isValidUuid(input.tenantId) || !isValidUuid(input.destinationId)) return { ok: false };
	return {
		ok: true,
		id: (await prisma.$transaction(async (tx) => {
			const created = await tx.siemExportBatch.create({ data: {
				tenantId: input.tenantId,
				destinationId: input.destinationId,
				eventCount: input.eventCount,
				payloadFormat: input.payloadFormat,
				payloadDigestSha256: input.payloadDigestSha256,
				deliveryStatus: "delivered",
				httpStatus: 200,
				sanitizedPreview: input.sanitizedPreview
			} });
			await tx.siemDestination.update({
				where: { id: input.destinationId },
				data: { lastExportedAt: /* @__PURE__ */ new Date() }
			});
			return created;
		})).id
	};
}
async function handlePublishFleetReleasePrisma(input) {
	if (!isValidUuid(input.tenantId)) return { ok: false };
	const publishedBy = isValidUuid(input.publishedBy) ? input.publishedBy : void 0;
	return {
		ok: true,
		id: (await prisma.fleetRelease.create({ data: {
			tenantId: input.tenantId,
			version: input.version,
			platform: input.platform,
			channel: input.channel,
			installerSha256: input.installerSha256,
			codeSigningThumbprint: input.codeSigningThumbprint,
			notarizationStatus: input.notarizationStatus,
			minOsVersion: input.minOsVersion,
			rolloutPercentage: input.rolloutPercentage,
			releaseNotes: input.releaseNotes,
			publishedBy
		} })).id
	};
}
async function handleCreateWarehouseExportPrisma(input) {
	if (!isValidUuid(input.tenantId)) return { ok: false };
	const triggeredBy = isValidUuid(input.triggeredBy) ? input.triggeredBy : void 0;
	return {
		ok: true,
		id: (await prisma.analyticsWarehouseExport.create({ data: {
			tenantId: input.tenantId,
			targetSink: input.targetSink,
			periodStart: new Date(input.periodStart),
			periodEnd: new Date(input.periodEnd),
			rowCount: input.rowCount,
			compressedBytes: BigInt(input.compressedBytes),
			objectPathUri: input.objectPathUri,
			checksumSha256: input.checksumSha256,
			status: "exported",
			triggeredBy
		} })).id
	};
}
async function handleRecordDrExercisePrisma(input) {
	if (!isValidUuid(input.tenantId)) return { ok: false };
	const conductedBy = isValidUuid(input.conductedBy) ? input.conductedBy : void 0;
	return {
		ok: true,
		id: (await prisma.drExercise.create({ data: {
			tenantId: input.tenantId,
			exerciseType: input.exerciseType,
			targetRpoMinutes: input.targetRpoMinutes,
			measuredRpoMinutes: input.measuredRpoMinutes,
			targetRtoMinutes: input.targetRtoMinutes,
			measuredRtoMinutes: input.measuredRtoMinutes,
			p95CrudMs: input.p95CrudMs,
			simulatedConcurrentDevs: input.simulatedConcurrentDevs,
			passed: input.passed,
			findingsSummary: input.findingsSummary,
			conductedBy
		} })).id
	};
}
async function handleUpsertSecurityAssessmentPrisma(input) {
	if (!isValidUuid(input.tenantId)) return { ok: false };
	return {
		ok: true,
		id: (await prisma.securityAssessment.create({ data: {
			tenantId: input.tenantId,
			assessmentName: input.assessmentName,
			assessorFirm: input.assessorFirm,
			assessmentType: input.assessmentType,
			status: input.status,
			criticalFindings: input.criticalFindings,
			highFindings: input.highFindings,
			remediatedFindings: input.remediatedFindings,
			reportSha256: input.reportSha256,
			signoffAt: input.status === "signed_off" ? /* @__PURE__ */ new Date() : void 0
		} })).id
	};
}
async function handleUpdateAccessibilityConfigPrisma(input) {
	if (!isValidUuid(input.tenantId)) return { ok: false };
	await prisma.tenantAccessibilityConfig.upsert({
		where: { tenantId: input.tenantId },
		update: {
			defaultLocale: input.defaultLocale,
			highContrastMode: input.highContrastMode,
			keyboardShortcutsEnabled: input.keyboardShortcutsEnabled,
			wcagTargetLevel: input.wcagTargetLevel
		},
		create: {
			tenantId: input.tenantId,
			defaultLocale: input.defaultLocale,
			highContrastMode: input.highContrastMode,
			keyboardShortcutsEnabled: input.keyboardShortcutsEnabled,
			wcagTargetLevel: input.wcagTargetLevel
		}
	});
	return { ok: true };
}
// src/types/permissions.types.ts
const PERMISSION_MODULES = [
	{
		id: "tasks",
		name: "Tasks Management",
		description: "Fine-grained control over task creation, editing, assignment, status and acceptance sign-offs.",
		icon: "📋"
	},
	{
		id: "projects",
		name: "Projects & Workspaces",
		description: "Permissions for provisioning, updating and archiving client projects.",
		icon: "📁"
	},
	{
		id: "timer",
		name: "Focus Timer & Sessions",
		description: "Live time tracking, break intervals and manual session registration.",
		icon: "⏱️"
	},
	{
		id: "timesheets",
		name: "Timesheets & Approvals",
		description: "Timesheet submissions, line-item approvals, rejections and locking periods.",
		icon: "📅"
	},
	{
		id: "payments",
		name: "Developer Payments & Payouts",
		description: "Developer pay rates, payout schedules, disbursement tracking and read-only earnings statements.",
		icon: "💸"
	},
	{
		id: "billing",
		name: "Contracts & Billing",
		description: "Rate card management, draft invoice generation and credit note adjustments.",
		icon: "💳"
	},
	{
		id: "team",
		name: "Team & Member Management",
		description: "Inviting members, managing seats, status toggling and account revocations.",
		icon: "👥"
	},
	{
		id: "roles",
		name: "Roles & Permissions",
		description: "Authoring custom roles, assigning permissions and configuring access policies.",
		icon: "🛡️"
	},
	{
		id: "timeline",
		name: "Activity Timeline & Evidence",
		description: "Viewing digital activity timelines, gap annotations and privacy exclusion scopes.",
		icon: "🔍"
	},
	{
		id: "verification",
		name: "AI Verification & Rules",
		description: "Configuring heuristic verification rules and approving AI digest generations.",
		icon: "🤖"
	},
	{
		id: "disputes",
		name: "Disputes & Appeals",
		description: "Initiating, reviewing and resolving client-developer billing disputes.",
		icon: "⚖️"
	},
	{
		id: "integrations",
		name: "Integrations & API Ecosystem",
		description: "Connecting IDE plugins, desktop agents, git webhooks and developer API keys.",
		icon: "🔌"
	},
	{
		id: "compliance",
		name: "Enterprise Compliance & Audit",
		description: "Immutable security audit exports, SSO/SAML, legal holds and retention policies.",
		icon: "📜"
	},
	{
		id: "superadmin",
		name: "Super Admin Platform Privileges",
		description: "Platform-level tenant orchestration, owner permission governance and master access.",
		icon: "👑"
	}
];
const GRANULAR_PERMISSIONS = [
	{
		key: "task:create",
		module: "tasks",
		label: "Create Tasks",
		description: "Can create new work tasks within assigned projects."
	},
	{
		key: "task:view",
		module: "tasks",
		label: "View Tasks",
		description: "Can inspect task backlogs, details and estimates."
	},
	{
		key: "task:edit",
		module: "tasks",
		label: "Edit Task Specifications",
		description: "Can update task titles, estimates, work modes and acceptance criteria."
	},
	{
		key: "task:delete",
		module: "tasks",
		label: "Delete Tasks",
		description: "Can permanently remove unassigned or obsolete tasks."
	},
	{
		key: "task:assign",
		module: "tasks",
		label: "Assign Members to Tasks",
		description: "Can allocate tasks to team developers or managers."
	},
	{
		key: "task:status_change",
		module: "tasks",
		label: "Update Task Progress & Status",
		description: "Can transition task status between Backlog, Active, Review and Done."
	},
	{
		key: "task:approve",
		module: "tasks",
		label: "Approve & Sign-off Task Completion",
		description: "Can certify that completed tasks satisfy acceptance criteria."
	},
	{
		key: "project:create",
		module: "projects",
		label: "Create Projects",
		description: "Can provision new client projects and workspaces."
	},
	{
		key: "project:view",
		module: "projects",
		label: "View Projects",
		description: "Can view project lists, clients and overall progress."
	},
	{
		key: "project:edit",
		module: "projects",
		label: "Edit Projects",
		description: "Can update project codes, names, clients and descriptions."
	},
	{
		key: "project:delete",
		module: "projects",
		label: "Archive & Delete Projects",
		description: "Can pause, archive or delete project repositories."
	},
	{
		key: "timer:start_stop",
		module: "timer",
		label: "Start / Stop Work Timer",
		description: "Can launch live tracked work sessions and log breaks."
	},
	{
		key: "timer:manual_entry",
		module: "timer",
		label: "Manual Time Registration",
		description: "Can submit retroactive or manual time adjustments."
	},
	{
		key: "timer:view_own",
		module: "timer",
		label: "View Own Sessions",
		description: "Can inspect own active and historical timer sessions."
	},
	{
		key: "timer:view_team",
		module: "timer",
		label: "View Team Sessions",
		description: "Can monitor real-time active sessions across the entire team."
	},
	{
		key: "timer:edit",
		module: "timer",
		label: "Edit Session Durations",
		description: "Can adjust timestamps and context notes on recorded sessions."
	},
	{
		key: "timesheet:view_own",
		module: "timesheets",
		label: "View Own Timesheets",
		description: "Can review own timesheet draft lines and hours."
	},
	{
		key: "timesheet:view_team",
		module: "timesheets",
		label: "View Team Timesheets",
		description: "Can inspect all team timesheets across projects."
	},
	{
		key: "timesheet:submit",
		module: "timesheets",
		label: "Submit Timesheets",
		description: "Can submit completed timesheets for peer or client review."
	},
	{
		key: "timesheet:approve",
		module: "timesheets",
		label: "Approve Timesheet Hours",
		description: "Can formally approve submitted billable and unbillable hours."
	},
	{
		key: "timesheet:reject",
		module: "timesheets",
		label: "Reject & Request Clarification",
		description: "Can flag timesheet lines requiring evidence or clarification."
	},
	{
		key: "timesheet:lock",
		module: "timesheets",
		label: "Lock Accounting Periods",
		description: "Can lock timesheet billing cycles to make them immutable."
	},
	{
		key: "payment:view_own",
		module: "payments",
		label: "View Own Payments (Read-Only)",
		description: "Can view own configured pay rate, payout schedule, accrued earnings and payout history in read-only mode."
	},
	{
		key: "payment:view_team",
		module: "payments",
		label: "View Team Payments",
		description: "Can inspect payment configurations, accrued payroll and payout history across all workspace members."
	},
	{
		key: "payment:configure",
		module: "payments",
		label: "Configure Developer Payments",
		description: "Can configure developer hourly/retainer pay rates, payout schedules, payment methods and tax withholding."
	},
	{
		key: "payment:record_payout",
		module: "payments",
		label: "Record & Mark Payouts Paid",
		description: "Can create payout disbursements and update payout statuses (Scheduled, Processing, Paid)."
	},
	{
		key: "billing:view",
		module: "billing",
		label: "View Financial Records",
		description: "Can inspect invoices, rate cards and accrued billing totals."
	},
	{
		key: "billing:manage_rates",
		module: "billing",
		label: "Manage Effective-Dated Rate Cards",
		description: "Can create and modify historical hourly billing rates."
	},
	{
		key: "invoice:create_draft",
		module: "billing",
		label: "Generate Invoice Drafts",
		description: "Can compile approved timesheets into formal invoice drafts."
	},
	{
		key: "invoice:lock_finalize",
		module: "billing",
		label: "Lock & Finalize Invoices",
		description: "Can seal finalized invoices and trigger client payment requests."
	},
	{
		key: "invoice:credit_adjust",
		module: "billing",
		label: "Issue Credit Adjustments",
		description: "Can issue credit notes and refund rebills against locked periods."
	},
	{
		key: "member:view",
		module: "team",
		label: "View Team Members",
		description: "Can inspect workspace roster, membership statuses and emails."
	},
	{
		key: "member:invite",
		module: "team",
		label: "Invite Team Members",
		description: "Can send workspace invitations and generate login credentials."
	},
	{
		key: "member:edit_role",
		module: "team",
		label: "Assign Roles & Permissions",
		description: "Can promote, demote or reassign member roles and override permissions."
	},
	{
		key: "member:status_toggle",
		module: "team",
		label: "Activate / Suspend Members",
		description: "Can toggle member status between active, suspended and revoked."
	},
	{
		key: "member:delete",
		module: "team",
		label: "Delete Team Members",
		description: "Can permanently remove members and cascade associated assignments."
	},
	{
		key: "role:view",
		module: "roles",
		label: "View Role Matrices",
		description: "Can view configured system and custom roles and assigned permissions."
	},
	{
		key: "role:create",
		module: "roles",
		label: "Create Custom Roles",
		description: "Can define new custom roles with customized granular permissions."
	},
	{
		key: "role:edit",
		module: "roles",
		label: "Edit Custom Roles",
		description: "Can modify permissions and descriptions for existing custom roles."
	},
	{
		key: "role:delete",
		module: "roles",
		label: "Delete Custom Roles",
		description: "Can remove non-system roles that are no longer needed."
	},
	{
		key: "timeline:view_own",
		module: "timeline",
		label: "View Own Activity Timeline",
		description: "Can review own minute-by-minute activity rollups and apps."
	},
	{
		key: "timeline:view_team",
		module: "timeline",
		label: "View Team Activity Timeline",
		description: "Can audit activity timeline and rollups for all team members."
	},
	{
		key: "evidence:annotate",
		module: "timeline",
		label: "Add Session Annotations",
		description: "Can attach explanatory notes and justifications to timeline gaps."
	},
	{
		key: "privacy:manage_rules",
		module: "timeline",
		label: "Configure Privacy Exclusions",
		description: "Can manage client-side privacy exclusions and redaction rules."
	},
	{
		key: "verification:view",
		module: "verification",
		label: "View Verification Insights",
		description: "Can view corroborated evidence scores and anomaly indicators."
	},
	{
		key: "verification:manage_rules",
		module: "verification",
		label: "Manage Verification Rule Sets",
		description: "Can configure deterministic rules for multi-source evidence verification."
	},
	{
		key: "verification:approve_drafts",
		module: "verification",
		label: "Approve AI Work Summaries",
		description: "Can sign off on automated work summary digests and sprint reports."
	},
	{
		key: "dispute:open",
		module: "disputes",
		label: "Raise Disputes & Appeals",
		description: "Can flag discrepancies in hours or evidence for formal review."
	},
	{
		key: "dispute:view",
		module: "disputes",
		label: "View Dispute Cases",
		description: "Can inspect open dispute threads, logs and arbitration messages."
	},
	{
		key: "dispute:resolve",
		module: "disputes",
		label: "Resolve Disputes",
		description: "Can adjudicate, adjust billed amounts and close dispute cases."
	},
	{
		key: "dispute:escalate",
		module: "disputes",
		label: "Escalate Disputes",
		description: "Can elevate unresolved disputes to senior leadership or external auditors."
	},
	{
		key: "integration:view",
		module: "integrations",
		label: "View Connected Services",
		description: "Can view connected git providers, IDE extensions and agent devices."
	},
	{
		key: "integration:manage",
		module: "integrations",
		label: "Configure Integrations & Webhooks",
		description: "Can connect new repositories, webhooks, and issue API tokens."
	},
	{
		key: "compliance:view",
		module: "compliance",
		label: "View Compliance Policies",
		description: "Can review published privacy policies, DPIA assessments and consents."
	},
	{
		key: "compliance:audit_export",
		module: "compliance",
		label: "Export Immutable Audit Ledgers",
		description: "Can download cryptographically hashed security and access logs."
	},
	{
		key: "compliance:sso_manage",
		module: "compliance",
		label: "Configure SSO & SCIM",
		description: "Can link enterprise SAML/OIDC identity providers and directory sync."
	},
	{
		key: "compliance:legal_hold",
		module: "compliance",
		label: "Manage Legal Holds",
		description: "Can place or release litigation holds that freeze data retention purges."
	},
	{
		key: "superadmin:cross_tenant_view",
		module: "superadmin",
		label: "Cross-Tenant Global Switcher",
		description: "Can inspect, switch into and administer any workspace on the platform.",
		isSuperAdminOnly: true
	},
	{
		key: "superadmin:manage_tenant_owner_permissions",
		module: "superadmin",
		label: "Tenant Owner Permission Governance",
		description: "Can restrict, customize or grant capabilities to Tenant Owners.",
		isSuperAdminOnly: true
	},
	{
		key: "superadmin:platform_plans_pricing",
		module: "superadmin",
		label: "SaaS Platform Plans & Pricing Engine",
		description: "Can alter subscription tiers, seat limits and global feature flags.",
		isSuperAdminOnly: true
	},
	{
		key: "superadmin:system_health_audit",
		module: "superadmin",
		label: "Global Telemetry & Direct DB Audits",
		description: "Master visibility into distributed background workers and audit chains.",
		isSuperAdminOnly: true
	}
];
/**
* Default base permissions for Tenant Owners.
* Note: Super Admin can customize these per tenant!
*/
const DEFAULT_TENANT_OWNER_PERMISSIONS = [...GRANULAR_PERMISSIONS.filter((p) => !p.isSuperAdminOnly).map((p) => p.key)];
/**
* Pre-defined system roles shipped with every workspace.
*/
const DEFAULT_PREDEFINED_ROLES = [
	{
		id: "role-super-admin",
		tenantId: "system",
		name: "Super Admin",
		code: "super_admin",
		description: "Master platform administrator with automatic full access to all existing and future permissions, plus platform governance.",
		isSystemRole: true,
		permissions: GRANULAR_PERMISSIONS.map((p) => p.key)
	},
	{
		id: "role-tenant-owner",
		tenantId: "system",
		name: "Tenant Owner",
		code: "tenant_owner",
		description: "Workspace owner with full authority over projects, tasks, billing, team invitations and custom roles.",
		isSystemRole: true,
		permissions: [...DEFAULT_TENANT_OWNER_PERMISSIONS]
	},
	{
		id: "role-project-manager",
		tenantId: "system",
		name: "Project Manager",
		code: "project_manager",
		description: "Manages projects, creates & assigns tasks, approves timesheets, reviews activity timelines and handles disputes.",
		isSystemRole: true,
		permissions: [
			"task:create",
			"task:view",
			"task:edit",
			"task:delete",
			"task:assign",
			"task:status_change",
			"task:approve",
			"project:create",
			"project:view",
			"project:edit",
			"timer:start_stop",
			"timer:manual_entry",
			"timer:view_own",
			"timer:view_team",
			"timer:edit",
			"timesheet:view_own",
			"timesheet:view_team",
			"timesheet:submit",
			"timesheet:approve",
			"timesheet:reject",
			"payment:view_own",
			"member:view",
			"role:view",
			"timeline:view_own",
			"timeline:view_team",
			"evidence:annotate",
			"verification:view",
			"verification:manage_rules",
			"verification:approve_drafts",
			"dispute:view",
			"dispute:resolve",
			"integration:view"
		]
	},
	{
		id: "role-developer",
		tenantId: "system",
		name: "Developer",
		code: "developer",
		description: "Focuses on executing assigned tasks, logging work sessions, submitting timesheets and annotating evidence.",
		isSystemRole: true,
		permissions: [
			"task:view",
			"task:status_change",
			"project:view",
			"timer:start_stop",
			"timer:manual_entry",
			"timer:view_own",
			"timesheet:view_own",
			"timesheet:submit",
			"payment:view_own",
			"timeline:view_own",
			"evidence:annotate",
			"dispute:open",
			"dispute:view",
			"member:view",
			"integration:view"
		]
	},
	{
		id: "role-finance",
		tenantId: "system",
		name: "Finance & Invoicing",
		code: "finance",
		description: "Oversees contract rate cards, approved timesheet accounting, invoice drafting, locking periods and credit notes.",
		isSystemRole: true,
		permissions: [
			"task:view",
			"project:view",
			"timesheet:view_own",
			"timesheet:view_team",
			"timesheet:lock",
			"payment:view_own",
			"payment:view_team",
			"payment:record_payout",
			"billing:view",
			"billing:manage_rates",
			"invoice:create_draft",
			"invoice:lock_finalize",
			"invoice:credit_adjust",
			"member:view"
		]
	},
	{
		id: "role-client-reviewer",
		tenantId: "system",
		name: "Client Reviewer",
		code: "client_reviewer",
		description: "External client stakeholder with visibility into project progress, timesheet approvals and raising billing disputes.",
		isSystemRole: true,
		permissions: [
			"task:view",
			"project:view",
			"timesheet:view_team",
			"timesheet:approve",
			"timesheet:reject",
			"payment:view_own",
			"dispute:open",
			"dispute:view",
			"timeline:view_team",
			"member:view"
		]
	},
	{
		id: "role-auditor",
		tenantId: "system",
		name: "Compliance Auditor",
		code: "auditor",
		description: "Independent compliance inspector with read-only access to immutable security ledgers, timelines and verification evidence.",
		isSystemRole: true,
		permissions: [
			"task:view",
			"project:view",
			"timesheet:view_team",
			"payment:view_own",
			"payment:view_team",
			"timeline:view_team",
			"verification:view",
			"compliance:view",
			"compliance:audit_export",
			"dispute:view",
			"member:view"
		]
	}
];
// prisma/seeds/permissions.seed.ts
/**
* DevProof (TikTrack) - Granular Permissions & System Roles Database Seed
*
* Idempotently seeds:
*   1. `permission_modules`   (all 13 modules)
*   2. `permissions`          (all granular permissions, e.g. task:create, task:edit,
*                              task:delete, task:view, task:assign, task:status_change,
*                              task:approve, ..., plus superadmin:* privileges)
*   3. `roles` & `role_permissions` for the 7 pre-defined system roles
*      (super_admin, tenant_owner, project_manager, developer, finance,
*       client_reviewer, auditor)
*   4. `system_seed_runs` ledger row (`seed_key = 'granular_rbac_v1'`) with a SHA-256
*      checksum of the permission catalog.
*
* First-run & auto-evolution behavior:
*   - On first application startup (when `system_seed_runs` has no row for
*     `granular_rbac_v1`), `ensurePermissionsSeeded()` creates the RBAC tables if
*     needed and writes the entire permission catalog + system roles to PostgreSQL.
*   - Whenever a new permission is added to `GRANULAR_PERMISSIONS` in code, the
*     catalog checksum changes, so the next startup automatically upserts the new
*     permission into `permissions` and grants it to `super_admin` (and to
*     `tenant_owner` if it is not marked `isSuperAdminOnly`).
*/
const PERMISSIONS_SEED_KEY = "granular_rbac_v1";
/**
* Deterministic UUIDs for the 7 pre-defined system roles (`tenant_id IS NULL`)
* so primary-key upserts are 100% repeatable across environments.
*/
const SYSTEM_ROLE_UUIDS = {
	super_admin: "00000000-0000-4000-8000-000000000001",
	tenant_owner: "00000000-0000-4000-8000-000000000002",
	project_manager: "00000000-0000-4000-8000-000000000003",
	developer: "00000000-0000-4000-8000-000000000004",
	finance: "00000000-0000-4000-8000-000000000005",
	client_reviewer: "00000000-0000-4000-8000-000000000006",
	auditor: "00000000-0000-4000-8000-000000000007"
};
function computeCatalogChecksum() {
	const payload = JSON.stringify({
		version: 1,
		modules: PERMISSION_MODULES,
		permissions: GRANULAR_PERMISSIONS,
		roles: DEFAULT_PREDEFINED_ROLES.map((r) => ({
			code: r.code,
			name: r.name,
			description: r.description,
			permissions: r.permissions
		}))
	});
	return crypto$1.createHash("sha256").update(payload).digest("hex");
}
let inMemorySeededChecksum = null;
let inFlightSeedPromise = null;
/**
* Ensures the 0017 RBAC tables exist in PostgreSQL before querying/seeding.
* Uses `IF NOT EXISTS` DDL so it is a no-op once tables are present.
*/
async function ensureRbacSchemaExists() {
	const migrationPath = [path.resolve(import.meta.dirname, "../../supabase/migrations/0017_granular_rbac_permissions.sql"), path.resolve(process.cwd(), "supabase/migrations/0017_granular_rbac_permissions.sql")].find((p) => fs.existsSync(p));
	if (!migrationPath) return;
	const statements = fs.readFileSync(migrationPath, "utf8").split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").split(";").map((stmt) => stmt.trim()).filter((stmt) => stmt.length > 0);
	for (const stmt of statements) await prisma.$executeRawUnsafe(stmt);
}
/**
* Runs the granular permissions & system roles seed unconditionally.
* Called by `npm run db:seed` and by `ensurePermissionsSeeded()` when the DB has
* not been seeded yet or the permission catalog checksum has changed.
*/
async function seedPermissionsAndRoles(options) {
	await ensureRbacSchemaExists();
	const checksum = computeCatalogChecksum();
	const existingRun = await prisma.systemSeedRun.findUnique({ where: { seedKey: PERMISSIONS_SEED_KEY } });
	if (!options?.force && existingRun && existingRun.checksum === checksum) {
		await grantAllDatabasePermissionsToSuperAdmin();
		inMemorySeededChecksum = checksum;
		return {
			seeded: false,
			firstTime: false,
			checksum,
			moduleCount: PERMISSION_MODULES.length,
			permissionCount: GRANULAR_PERMISSIONS.length,
			systemRoleCount: DEFAULT_PREDEFINED_ROLES.length
		};
	}
	const firstTime = !existingRun;
	await prisma.$transaction(async (tx) => {
		for (let i = 0; i < PERMISSION_MODULES.length; i++) {
			const mod = PERMISSION_MODULES[i];
			await tx.permissionModule.upsert({
				where: { id: mod.id },
				update: {
					name: mod.name,
					description: mod.description,
					icon: mod.icon,
					sortOrder: i
				},
				create: {
					id: mod.id,
					name: mod.name,
					description: mod.description,
					icon: mod.icon,
					sortOrder: i
				}
			});
		}
		for (let i = 0; i < GRANULAR_PERMISSIONS.length; i++) {
			const perm = GRANULAR_PERMISSIONS[i];
			await tx.permission.upsert({
				where: { key: perm.key },
				update: {
					moduleId: perm.module,
					label: perm.label,
					description: perm.description,
					isSuperAdminOnly: Boolean(perm.isSuperAdminOnly),
					isActive: true,
					sortOrder: i
				},
				create: {
					key: perm.key,
					moduleId: perm.module,
					label: perm.label,
					description: perm.description,
					isSuperAdminOnly: Boolean(perm.isSuperAdminOnly),
					isActive: true,
					sortOrder: i
				}
			});
		}
		const allDbPermissions = await tx.permission.findMany({
			where: { isActive: true },
			select: {
				key: true,
				isSuperAdminOnly: true
			}
		});
		const allPermissionKeys = allDbPermissions.map((p) => p.key);
		const allTenantPermissionKeys = allDbPermissions.filter((p) => !p.isSuperAdminOnly).map((p) => p.key);
		for (const sysRole of DEFAULT_PREDEFINED_ROLES) {
			const roleId = SYSTEM_ROLE_UUIDS[sysRole.code];
			if (!roleId) continue;
			await tx.role.upsert({
				where: { id: roleId },
				update: {
					code: sysRole.code,
					name: sysRole.name,
					description: sysRole.description,
					isSystemRole: true,
					tenantId: null
				},
				create: {
					id: roleId,
					tenantId: null,
					code: sysRole.code,
					name: sysRole.name,
					description: sysRole.description,
					isSystemRole: true
				}
			});
			const targetKeys = sysRole.code === "super_admin" ? allPermissionKeys : sysRole.code === "tenant_owner" ? allTenantPermissionKeys : sysRole.permissions;
			await tx.rolePermission.deleteMany({ where: { roleId } });
			if (targetKeys.length > 0) await tx.rolePermission.createMany({
				data: targetKeys.map((permissionKey) => ({
					roleId,
					permissionKey
				})),
				skipDuplicates: true
			});
		}
		await tx.systemSeedRun.upsert({
			where: { seedKey: PERMISSIONS_SEED_KEY },
			update: {
				version: 1,
				checksum,
				runCount: { increment: 1 },
				lastAppliedAt: /* @__PURE__ */ new Date()
			},
			create: {
				seedKey: PERMISSIONS_SEED_KEY,
				version: 1,
				checksum,
				runCount: 1
			}
		});
	}, {
		timeout: 6e4,
		maxWait: 15e3
	});
	inMemorySeededChecksum = checksum;
	return {
		seeded: true,
		firstTime,
		checksum,
		moduleCount: PERMISSION_MODULES.length,
		permissionCount: GRANULAR_PERMISSIONS.length,
		systemRoleCount: DEFAULT_PREDEFINED_ROLES.length
	};
}
/**
* Ensures the `super_admin` system role has a `role_permissions` row for every
* active permission in the `permissions` table (so even permissions inserted at
* runtime or by future migrations automatically apply to Super Admin).
*/
async function grantAllDatabasePermissionsToSuperAdmin() {
	const superRoleId = SYSTEM_ROLE_UUIDS.super_admin;
	const allPerms = await prisma.permission.findMany({
		where: { isActive: true },
		select: { key: true }
	});
	if (allPerms.length === 0) return;
	await prisma.rolePermission.createMany({
		data: allPerms.map((p) => ({
			roleId: superRoleId,
			permissionKey: p.key
		})),
		skipDuplicates: true
	});
}
/**
* Called automatically during `/api/prisma/bootstrap` on application startup.
* Runs the seed on the very first run (or when the catalog checksum changes) and
* caches the checksum in memory so subsequent requests in the same server process
* incur zero overhead.
*/
async function ensurePermissionsSeeded() {
	const targetChecksum = computeCatalogChecksum();
	if (inMemorySeededChecksum === targetChecksum) return {
		seeded: false,
		firstTime: false,
		checksum: targetChecksum,
		moduleCount: PERMISSION_MODULES.length,
		permissionCount: GRANULAR_PERMISSIONS.length,
		systemRoleCount: DEFAULT_PREDEFINED_ROLES.length
	};
	if (!inFlightSeedPromise) inFlightSeedPromise = seedPermissionsAndRoles().finally(() => {
		inFlightSeedPromise = null;
	});
	return inFlightSeedPromise;
}
// src/server/prismaRbacHandlers.ts
/**
* DevProof (TikTrack) - Prisma Handlers for Granular RBAC (Permissions, Roles,
* Member Permission Overrides & Super Admin Tenant-Owner Policy Governance)
*/
async function handleBootstrapRbacData() {
	const seedStatus = await ensurePermissionsSeeded();
	const [dbModules, dbPermissions, dbRoles, dbOwnerPolicies, dbMemberGrants] = await Promise.all([
		prisma.permissionModule.findMany({ orderBy: { sortOrder: "asc" } }),
		prisma.permission.findMany({
			where: { isActive: true },
			orderBy: [{ sortOrder: "asc" }, { key: "asc" }]
		}),
		prisma.role.findMany({
			include: { permissions: true },
			orderBy: [{ isSystemRole: "desc" }, { createdAt: "asc" }]
		}),
		prisma.tenantOwnerPermissionPolicy.findMany({ include: { permissions: true } }),
		prisma.memberPermissionGrant.findMany()
	]);
	const allPermissionKeys = dbPermissions.map((p) => p.key);
	const modules = dbModules.map((m) => ({
		id: m.id,
		name: m.name,
		description: m.description,
		icon: m.icon
	}));
	const permissions = dbPermissions.map((p) => ({
		key: p.key,
		module: p.moduleId,
		label: p.label,
		description: p.description,
		isSuperAdminOnly: p.isSuperAdminOnly || void 0
	}));
	const roles = dbRoles.map((r) => ({
		id: r.id,
		tenantId: r.isSystemRole || !r.tenantId ? "system" : r.tenantId,
		name: r.name,
		code: r.code,
		description: r.description,
		isSystemRole: r.isSystemRole,
		permissions: r.code === "super_admin" ? allPermissionKeys : r.permissions.map((rp) => rp.permissionKey),
		createdAt: r.createdAt.toISOString(),
		updatedAt: r.updatedAt.toISOString()
	}));
	const tenantOwnerPermissions = {};
	for (const policy of dbOwnerPolicies) tenantOwnerPermissions[policy.tenantId] = policy.permissions.map((p) => p.permissionKey);
	const memberGrantsByMembershipId = {};
	for (const grant of dbMemberGrants) {
		if (!memberGrantsByMembershipId[grant.membershipId]) memberGrantsByMembershipId[grant.membershipId] = [];
		memberGrantsByMembershipId[grant.membershipId].push(grant.permissionKey);
	}
	return {
		seedStatus,
		modules,
		permissions,
		roles,
		tenantOwnerPermissions,
		memberGrantsByMembershipId
	};
}
async function handleCreateCustomRolePrisma(body) {
	if (!isValidUuid(body.tenantId)) return {
		ok: false,
		error: "Valid tenantId UUID is required."
	};
	const cleanName = body.name?.trim();
	const cleanCode = (body.code?.trim() || cleanName.toLowerCase().replace(/[^a-z0-9]/g, "_")).slice(0, 32);
	if (!cleanName || !cleanCode) return {
		ok: false,
		error: "Role name and code are required."
	};
	const validKeys = (await prisma.permission.findMany({
		where: {
			key: { in: body.permissions ?? [] },
			isSuperAdminOnly: false
		},
		select: { key: true }
	})).map((p) => p.key);
	const created = await prisma.$transaction(async (tx) => {
		const role = await tx.role.create({ data: {
			tenantId: body.tenantId,
			code: cleanCode,
			name: cleanName,
			description: body.description?.trim() ?? "",
			isSystemRole: false,
			createdBy: isValidUuid(body.createdBy) ? body.createdBy : null
		} });
		if (validKeys.length > 0) await tx.rolePermission.createMany({
			data: validKeys.map((permissionKey) => ({
				roleId: role.id,
				permissionKey
			})),
			skipDuplicates: true
		});
		return role;
	});
	return {
		ok: true,
		role: {
			id: created.id,
			tenantId: created.tenantId ?? body.tenantId,
			name: created.name,
			code: created.code,
			description: created.description,
			isSystemRole: false,
			permissions: validKeys,
			createdAt: created.createdAt.toISOString(),
			updatedAt: created.updatedAt.toISOString()
		}
	};
}
async function handleUpdateCustomRolePrisma(body) {
	if (!isValidUuid(body.roleId)) return {
		ok: false,
		error: "Valid roleId UUID is required."
	};
	const existing = await prisma.role.findUnique({ where: { id: body.roleId } });
	if (!existing) return {
		ok: false,
		error: "Role not found in database."
	};
	if (existing.isSystemRole) return {
		ok: false,
		error: "Pre-defined system roles cannot be modified directly."
	};
	await prisma.$transaction(async (tx) => {
		await tx.role.update({
			where: { id: body.roleId },
			data: {
				name: body.name?.trim() || existing.name,
				description: body.description !== void 0 ? body.description.trim() : existing.description
			}
		});
		if (body.permissions) {
			const validPerms = await tx.permission.findMany({
				where: {
					key: { in: body.permissions },
					isSuperAdminOnly: false
				},
				select: { key: true }
			});
			await tx.rolePermission.deleteMany({ where: { roleId: body.roleId } });
			if (validPerms.length > 0) await tx.rolePermission.createMany({
				data: validPerms.map((p) => ({
					roleId: body.roleId,
					permissionKey: p.key
				})),
				skipDuplicates: true
			});
		}
	});
	return { ok: true };
}
async function handleDeleteCustomRolePrisma(body) {
	if (!isValidUuid(body.roleId)) return {
		ok: false,
		error: "Valid roleId UUID is required."
	};
	const existing = await prisma.role.findUnique({ where: { id: body.roleId } });
	if (!existing) return { ok: true };
	if (existing.isSystemRole) return {
		ok: false,
		error: "System roles cannot be deleted."
	};
	await prisma.role.delete({ where: { id: body.roleId } });
	return { ok: true };
}
async function handleUpdateMemberRoleAndPermissionsPrisma(body) {
	if (!isValidUuid(body.tenantId) || !isValidUuid(body.userId)) return {
		ok: false,
		error: "Valid tenantId and userId UUIDs are required."
	};
	const membership = await prisma.membership.findUnique({ where: { tenantId_userId: {
		tenantId: body.tenantId,
		userId: body.userId
	} } });
	if (!membership) return {
		ok: false,
		error: "Membership not found."
	};
	await prisma.$transaction(async (tx) => {
		await tx.roleGrant.deleteMany({ where: {
			tenantId: body.tenantId,
			membershipId: membership.id,
			projectScopeId: null
		} });
		await tx.roleGrant.create({ data: {
			tenantId: body.tenantId,
			membershipId: membership.id,
			role: body.role,
			grantedBy: isValidUuid(body.grantedBy) ? body.grantedBy : null
		} });
		if (body.customPermissions !== void 0) {
			await tx.memberPermissionGrant.deleteMany({ where: {
				membershipId: membership.id,
				tenantId: body.tenantId
			} });
			if (body.customPermissions.length > 0) {
				const validPerms = await tx.permission.findMany({
					where: {
						key: { in: body.customPermissions },
						isSuperAdminOnly: false
					},
					select: { key: true }
				});
				if (validPerms.length > 0) await tx.memberPermissionGrant.createMany({
					data: validPerms.map((p) => ({
						membershipId: membership.id,
						tenantId: body.tenantId,
						permissionKey: p.key,
						grantedBy: isValidUuid(body.grantedBy) ? body.grantedBy : null
					})),
					skipDuplicates: true
				});
			}
		}
	});
	return { ok: true };
}
async function handleUpdateTenantOwnerPermissionsPrisma(body) {
	if (!isValidUuid(body.tenantId)) return {
		ok: false,
		error: "Valid tenantId UUID is required."
	};
	const validPerms = await prisma.permission.findMany({
		where: {
			key: { in: body.permissions ?? [] },
			isSuperAdminOnly: false
		},
		select: { key: true }
	});
	await prisma.$transaction(async (tx) => {
		await tx.tenantOwnerPermissionPolicy.upsert({
			where: { tenantId: body.tenantId },
			update: { updatedBy: isValidUuid(body.updatedBy) ? body.updatedBy : null },
			create: {
				tenantId: body.tenantId,
				updatedBy: isValidUuid(body.updatedBy) ? body.updatedBy : null
			}
		});
		await tx.tenantOwnerPermission.deleteMany({ where: { tenantId: body.tenantId } });
		if (validPerms.length > 0) await tx.tenantOwnerPermission.createMany({
			data: validPerms.map((p) => ({
				tenantId: body.tenantId,
				permissionKey: p.key
			})),
			skipDuplicates: true
		});
	});
	return { ok: true };
}
/**
* Registers a brand-new granular permission in PostgreSQL and automatically
* attaches it to the `super_admin` system role (and to `tenant_owner` default
* system role if not `isSuperAdminOnly`).
*/
async function handleRegisterPermissionPrisma(body) {
	const cleanKey = body.key?.trim().toLowerCase();
	const cleanLabel = body.label?.trim();
	if (!cleanKey || !cleanKey.includes(":") || !cleanLabel) return {
		ok: false,
		error: "Permission key (format module:action) and label are required."
	};
	const count = await prisma.permission.count({ where: { moduleId: body.module } });
	const saved = await prisma.permission.upsert({
		where: { key: cleanKey },
		update: {
			moduleId: body.module,
			label: cleanLabel,
			description: body.description?.trim() ?? "",
			isSuperAdminOnly: Boolean(body.isSuperAdminOnly),
			isActive: true
		},
		create: {
			key: cleanKey,
			moduleId: body.module,
			label: cleanLabel,
			description: body.description?.trim() ?? "",
			isSuperAdminOnly: Boolean(body.isSuperAdminOnly),
			isActive: true,
			sortOrder: count
		}
	});
	await grantAllDatabasePermissionsToSuperAdmin();
	if (!saved.isSuperAdminOnly && SYSTEM_ROLE_UUIDS.tenant_owner) await prisma.rolePermission.upsert({
		where: { roleId_permissionKey: {
			roleId: SYSTEM_ROLE_UUIDS.tenant_owner,
			permissionKey: saved.key
		} },
		update: {},
		create: {
			roleId: SYSTEM_ROLE_UUIDS.tenant_owner,
			permissionKey: saved.key
		}
	});
	return {
		ok: true,
		permission: {
			key: saved.key,
			module: saved.moduleId,
			label: saved.label,
			description: saved.description,
			isSuperAdminOnly: saved.isSuperAdminOnly || void 0
		}
	};
}
// src/server/prismaPhase1Handlers.ts
/**
* DevProof (TikTrack) - Prisma Phase 1 Server Handlers
*
* Implements full PostgreSQL persistence for Tenancy, RBAC, Policy Consents,
* Projects/Tasks/Assignments, Work Sessions/Breaks/Segments, Timesheets,
* Review Decisions, Disputes, Contracts/Rates, Invoices & Notifications.
*/
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUuid(val) {
	return Boolean(val && UUID_REGEX.test(val));
}
async function handleBootstrap() {
	const status = await checkPrismaConnection();
	if (!status.connected) return {
		status,
		tenants: [],
		members: [],
		projects: [],
		tasks: [],
		timesheetLines: [],
		contracts: [],
		invoices: [],
		notifications: [],
		planEntitlements: [],
		auditLogs: []
	};
	const rbac = await handleBootstrapRbacData();
	const [dbTenants, dbMemberships, dbProjects, dbTasks, dbTimesheetLines, dbContracts, dbInvoices, dbNotifications, dbEntitlements, dbAudits, phase2, phase3, phase4, phase5] = await Promise.all([
		prisma.tenant.findMany({
			include: {
				settings: true,
				policyVersions: { orderBy: { effectiveFrom: "desc" } }
			},
			orderBy: { createdAt: "asc" }
		}),
		prisma.membership.findMany({ include: {
			user: { include: {
				policyConsents: {
					include: { policyVersion: true },
					orderBy: { consentedAt: "desc" },
					take: 1
				},
				projectMemberships: true
			} },
			roleGrants: true
		} }),
		prisma.project.findMany({ orderBy: { createdAt: "asc" } }),
		prisma.task.findMany({
			include: {
				assignments: true,
				notes: true
			},
			orderBy: { createdAt: "asc" }
		}),
		prisma.timesheetLine.findMany({
			include: {
				timesheet: { include: { user: true } },
				appliedRateVersion: true,
				disputes: { include: { messages: {
					include: { author: true },
					orderBy: { createdAt: "asc" }
				} } }
			},
			orderBy: { workDate: "desc" }
		}),
		prisma.contract.findMany({ include: {
			project: true,
			rateVersions: { orderBy: { createdAt: "asc" } }
		} }),
		prisma.invoiceDraft.findMany({
			include: {
				project: true,
				lines: true
			},
			orderBy: { createdAt: "desc" }
		}),
		prisma.notification.findMany({
			orderBy: { createdAt: "desc" },
			take: 50
		}),
		prisma.planEntitlement.findMany(),
		prisma.auditEntry.findMany({
			include: { actorUser: true },
			orderBy: { occurredAtUtc: "desc" },
			take: 60
		}),
		handleBootstrapPhase2Data(),
		handleBootstrapPhase3Data(),
		handleBootstrapPhase4Data(),
		handleBootstrapPhase5Data()
	]);
	const taskById = new Map(dbTasks.map((t) => [t.id, t]));
	const superAdminEmails = Array.from(/* @__PURE__ */ new Set([...(process.env.SUPER_ADMIN_EMAILS || process.env.VITE_SUPER_ADMIN_EMAILS || "iamartseeker@gmail.com").toLowerCase().split(",").map((e) => e.trim()).filter(Boolean), "iamartseeker@gmail.com"]));
	return {
		status,
		tenants: dbTenants.map((t) => ({
			id: t.id,
			name: t.name,
			slug: t.slug,
			timezone: t.defaultTimezone,
			currency: t.defaultCurrency,
			planTier: t.planTier,
			aiEnabled: t.aiEnabled,
			roundingRule: t.settings?.roundingRule ?? "none",
			paidBreakMinutesPerDay: t.settings?.paidBreakAllowanceMinutes ?? 15,
			weeklyCapMinutes: t.settings?.weeklyCapMinutes ?? 2400,
			brandingConfig: t.settings?.brandingConfig ?? {},
			policyVersion: t.policyVersions[0]?.versionCode ?? "v1.0-2026-11",
			policyVersions: t.policyVersions.map((pv) => ({
				id: pv.id,
				versionCode: pv.versionCode,
				summaryMarkdown: pv.summaryMarkdown,
				effectiveFrom: pv.effectiveFrom.toISOString()
			}))
		})),
		members: dbMemberships.map((m) => {
			const isSuper = superAdminEmails.includes(m.user.email.toLowerCase().trim());
			return {
				id: m.userId,
				membershipId: m.id,
				tenantId: m.tenantId,
				name: m.user.fullName,
				email: m.user.email,
				role: isSuper ? "super_admin" : m.roleGrants[0]?.role ?? "developer",
				status: m.status,
				mfaEnabled: true,
				consentedPolicyVersion: m.user.policyConsents[0]?.policyVersion.versionCode ?? null,
				assignedProjectIds: m.user.projectMemberships.filter((pm) => pm.tenantId === m.tenantId).map((pm) => pm.projectId),
				customPermissions: rbac.memberGrantsByMembershipId[m.id] ?? []
			};
		}),
		projects: dbProjects.map((p) => ({
			id: p.id,
			tenantId: p.tenantId,
			code: p.code,
			name: p.name,
			clientName: p.clientName,
			status: p.status,
			description: p.description ?? ""
		})),
		tasks: dbTasks.map((t) => ({
			id: t.id,
			tenantId: t.tenantId,
			projectId: t.projectId,
			parentTaskId: t.parentTaskId ?? void 0,
			code: t.code,
			title: t.title,
			acceptanceCriteria: t.acceptanceCriteria,
			status: t.status,
			priority: t.priority,
			estimateMinutes: t.estimateMinutes,
			isBillable: t.isBillable,
			defaultWorkMode: t.defaultWorkMode,
			assignedMemberIds: t.assignments.map((a) => a.userId),
			dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : "2026-11-20",
			attachments: t.notes.flatMap((n) => n.attachmentPaths)
		})),
		timesheetLines: dbTimesheetLines.map((l) => {
			const task = taskById.get(l.taskId);
			return {
				id: l.id,
				timesheetId: l.timesheetId,
				timesheetStatus: l.timesheet.status,
				tenantId: l.tenantId,
				projectId: l.timesheet.projectId,
				taskId: l.taskId,
				taskCode: task?.code ?? "TASK",
				taskTitle: task?.title ?? "Project Task",
				developerId: l.timesheet.userId,
				developerName: l.timesheet.user.fullName,
				workDate: l.workDate.toISOString().slice(0, 10),
				startTime: "09:00",
				endTime: "10:30",
				workMode: l.workMode,
				provenance: l.provenance,
				elapsedMinutes: Number(l.elapsedMinutes),
				claimedMinutes: Number(l.claimedMinutes),
				observedMinutes: Number(l.observedMinutes),
				supportedMinutes: Number(l.supportedMinutes),
				approvedBillableMinutes: Number(l.approvedBillableMinutes),
				evidenceStatus: l.lineStatus === "approved" || l.lineStatus === "adjusted_approved" ? "approved" : l.lineStatus === "needs_clarification" ? "needs_clarification" : l.lineStatus === "disputed" || l.lineStatus === "rejected" ? "disputed" : "observed",
				snapshotHourlyRate: Number(l.snapshotHourlyRate),
				rateLabel: l.appliedRateVersion.versionLabel,
				developerNote: l.developerNote,
				managerComment: l.reviewerComment ?? void 0,
				disputeMessages: l.disputes.flatMap((d) => d.messages.map((msg) => ({
					author: msg.author.fullName,
					role: "member",
					text: msg.messageMarkdown,
					timestamp: msg.createdAt.toISOString()
				}))),
				isLocked: l.isLocked
			};
		}),
		contracts: dbContracts.map((c) => ({
			id: c.id,
			tenantId: c.tenantId,
			projectId: c.projectId,
			projectName: c.project.name,
			clientName: c.project.clientName,
			roundingRule: c.roundingRule,
			paidBreakAllowanceMinutesPerDay: c.paidBreakMinutesPerDay,
			weeklyCapMinutes: c.weeklyCapMinutes,
			deepWorkNoInputWindowMinutes: 90,
			idleClarificationThresholdMinutes: 15,
			rateVersions: c.rateVersions.map((rv) => ({
				id: rv.id,
				effectiveFrom: "2026-10-01",
				effectiveTo: null,
				hourlyRate: Number(rv.hourlyRate),
				currency: c.currency,
				label: rv.versionLabel
			}))
		})),
		invoices: dbInvoices.map((inv) => ({
			id: inv.id,
			tenantId: inv.tenantId,
			invoiceNumber: inv.invoiceNumber,
			projectId: inv.projectId,
			projectName: inv.project.name,
			clientName: inv.clientName,
			currency: inv.currency,
			periodLabel: "Current Billing Period",
			totalApprovedMinutes: inv.lines.reduce((sum, ln) => sum + Number(ln.approvedMinutes), 0),
			subtotalAmount: Number(inv.subtotalAmount),
			taxPercent: Number(inv.taxRatePercent),
			taxAmount: Number(inv.taxAmount),
			totalAmount: Number(inv.totalAmount),
			status: inv.status,
			referenceCreditForInvoiceId: inv.referenceCreditForInvoiceId ?? void 0,
			createdAt: inv.createdAt.toISOString(),
			lines: inv.lines.map((ln) => ({
				lineId: ln.timesheetLineId,
				workDate: ln.workDate.toISOString().slice(0, 10),
				taskCode: "TASK",
				description: ln.description,
				approvedMinutes: Number(ln.approvedMinutes),
				hourlyRate: Number(ln.snapshotHourlyRate),
				amount: Number(ln.lineTotal)
			}))
		})),
		notifications: dbNotifications.map((n) => ({
			id: n.id,
			tenantId: n.tenantId,
			recipientUserId: n.recipientUserId,
			type: n.notificationType,
			title: n.title,
			body: n.body,
			readAt: n.readAt ? n.readAt.toISOString() : null,
			createdAt: n.createdAt.toISOString()
		})),
		planEntitlements: dbEntitlements,
		auditLogs: dbAudits.map((a) => ({
			id: a.id,
			tenantId: a.tenantId,
			actorName: a.actorUser?.fullName ?? "System",
			actorRole: "tenant_owner",
			actionType: a.actionType,
			targetEntity: a.targetEntity,
			reason: a.reason ?? "",
			timestamp: a.occurredAtUtc.toISOString()
		})),
		phase2,
		phase3,
		phase4,
		phase5,
		rbac
	};
}
async function handleCreateTenant(body) {
	const baseSlug = body.slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || `workspace-${crypto.randomUUID().slice(0, 6)}`;
	const normalizedOwnerEmail = body.ownerEmail.toLowerCase().trim();
	const authOwner = !await prisma.userProfile.findFirst({
		where: { email: {
			equals: normalizedOwnerEmail,
			mode: "insensitive"
		} },
		select: { id: true }
	}) ? await ensureSupabaseAuthUser({
		email: normalizedOwnerEmail,
		name: body.ownerName.trim() || normalizedOwnerEmail.split("@")[0],
		role: "tenant_owner",
		tenantName: body.name
	}) : null;
	const created = await prisma.$transaction(async (tx) => {
		const slug = await tx.tenant.findUnique({
			where: { slug: baseSlug },
			select: { id: true }
		}) ? `${baseSlug}-${crypto.randomUUID().slice(0, 4)}` : baseSlug;
		const existingUser = (authOwner?.userId ? await tx.userProfile.findUnique({ where: { id: authOwner.userId } }) : null) || await tx.userProfile.findFirst({ where: { email: {
			equals: normalizedOwnerEmail,
			mode: "insensitive"
		} } });
		const user = existingUser ? await tx.userProfile.update({
			where: { id: existingUser.id },
			data: {
				fullName: body.ownerName.trim(),
				defaultTimezone: body.timezone
			}
		}) : await tx.userProfile.create({ data: {
			id: authOwner?.userId || crypto.randomUUID(),
			email: normalizedOwnerEmail,
			fullName: body.ownerName.trim(),
			defaultTimezone: body.timezone
		} });
		const tenant = await tx.tenant.create({ data: {
			name: body.name,
			slug,
			defaultTimezone: body.timezone,
			defaultCurrency: body.currency,
			planTier: "starter",
			status: "active"
		} });
		await tx.tenantSettings.create({ data: {
			tenantId: tenant.id,
			roundingRule: "none",
			paidBreakAllowanceMinutes: 15,
			weeklyCapMinutes: 2400
		} });
		const policy = await tx.policyVersion.create({ data: {
			tenantId: tenant.id,
			versionCode: "v1.0-2026-11",
			summaryMarkdown: "Privacy-first baseline policy.",
			publishedBy: user.id
		} });
		await tx.policyConsent.create({ data: {
			tenantId: tenant.id,
			userId: user.id,
			policyVersionId: policy.id
		} });
		const membership = await tx.membership.create({ data: {
			tenantId: tenant.id,
			userId: user.id,
			status: "active",
			joinedAt: /* @__PURE__ */ new Date()
		} });
		await tx.roleGrant.create({ data: {
			tenantId: tenant.id,
			membershipId: membership.id,
			role: "tenant_owner"
		} });
		await tx.auditEntry.create({ data: {
			tenantId: tenant.id,
			actorUserId: user.id,
			actionType: "TENANT_PROVISIONED",
			targetEntity: `tenants:${tenant.slug}`,
			targetId: tenant.id,
			reason: `Provisioned new workspace ${tenant.name}`
		} });
		return {
			tenant,
			user
		};
	});
	return {
		ok: true,
		tenantId: created.tenant.id,
		ownerId: created.user.id,
		slug: created.tenant.slug
	};
}
async function handleRecordSession(body) {
	if (!isValidUuid(body.tenantId) || !isValidUuid(body.userId) || !isValidUuid(body.projectId) || !isValidUuid(body.taskId)) return {
		ok: false,
		error: "Non-UUID fixture IDs; seed Supabase to persist."
	};
	const startIso = `${body.workDate}T${body.startTime}:00Z`;
	const endIso = `${body.workDate}T${body.endTime}:00Z`;
	const netMinutes = Math.max(0, body.durationMinutes - (body.breakMinutes || 0));
	const isDeepWork = [
		"thinking",
		"design",
		"research",
		"meeting"
	].includes(body.workMode);
	return {
		ok: true,
		...await prisma.$transaction(async (tx) => {
			const policy = await tx.policyVersion.findFirst({
				where: { tenantId: body.tenantId },
				orderBy: { effectiveFrom: "desc" }
			});
			if (!policy) throw new Error("No active policy_version found for tenant.");
			const session = await tx.workSession.create({ data: {
				tenantId: body.tenantId,
				userId: body.userId,
				projectId: body.projectId,
				taskId: body.taskId,
				provenance: body.provenance,
				lifecycleState: "completed",
				currentWorkMode: body.workMode,
				startedAtUtc: new Date(startIso),
				endedAtUtc: new Date(endIso),
				monotonicDurationMs: netMinutes * 6e4,
				sessionNotes: body.developerNote,
				manualReason: body.manualReason ?? null,
				policyVersionId: policy.id
			} });
			if (body.breakMinutes > 0) await tx.break.create({ data: {
				tenantId: body.tenantId,
				userId: body.userId,
				sessionId: session.id,
				breakType: "unpaid",
				startedAtUtc: new Date(startIso),
				endedAtUtc: new Date(new Date(startIso).getTime() + body.breakMinutes * 6e4)
			} });
			let contract = await tx.contract.findFirst({
				where: {
					tenantId: body.tenantId,
					projectId: body.projectId
				},
				include: { rateVersions: {
					orderBy: { createdAt: "desc" },
					take: 1
				} }
			});
			if (!contract) contract = await tx.contract.create({
				data: {
					tenantId: body.tenantId,
					projectId: body.projectId,
					title: "Project Standard Contract",
					currency: "USD"
				},
				include: { rateVersions: true }
			});
			let rateVersionId = contract.rateVersions[0]?.id;
			if (!rateVersionId) rateVersionId = (await tx.$queryRaw`
        INSERT INTO public.contract_rate_versions (tenant_id, contract_id, version_label, effective_period, hourly_rate)
        VALUES (${body.tenantId}::uuid, ${contract.id}::uuid, 'Standard Rate', '[2026-01-01,)'::daterange, ${body.hourlyRate})
        RETURNING id
      `)[0].id;
			const segmentId = (await tx.$queryRaw`
      INSERT INTO public.time_segments (
        tenant_id, user_id, project_id, task_id, session_id, work_date,
        segment_range, work_mode, provenance, evidence_status,
        elapsed_minutes, claimed_minutes, observed_minutes, supported_minutes, developer_explanation
      )
      VALUES (
        ${body.tenantId}::uuid,
        ${body.userId}::uuid,
        ${body.projectId}::uuid,
        ${body.taskId}::uuid,
        ${session.id}::uuid,
        ${body.workDate}::date,
        tstzrange(${startIso}::timestamptz, ${endIso}::timestamptz, '[)'),
        ${body.workMode},
        ${body.provenance},
        ${body.provenance === "manual_entry" ? "needs_clarification" : isDeepWork ? "context_added" : "observed"},
        ${body.durationMinutes},
        ${netMinutes},
        ${isDeepWork || body.provenance === "manual_entry" ? 0 : netMinutes},
        ${netMinutes},
        ${body.developerNote}
      )
      RETURNING id
    `)[0].id;
			const workDateObj = /* @__PURE__ */ new Date(`${body.workDate}T00:00:00Z`);
			const day = workDateObj.getUTCDay() || 7;
			const monday = new Date(workDateObj);
			monday.setUTCDate(workDateObj.getUTCDate() - (day - 1));
			const sunday = new Date(monday);
			sunday.setUTCDate(monday.getUTCDate() + 6);
			const timesheet = await tx.timesheet.upsert({
				where: { tenantId_userId_projectId_periodStart_periodEnd: {
					tenantId: body.tenantId,
					userId: body.userId,
					projectId: body.projectId,
					periodStart: monday,
					periodEnd: sunday
				} },
				update: {},
				create: {
					tenantId: body.tenantId,
					userId: body.userId,
					projectId: body.projectId,
					contractId: contract.id,
					periodStart: monday,
					periodEnd: sunday,
					status: "draft"
				}
			});
			const line = await tx.timesheetLine.create({ data: {
				tenantId: body.tenantId,
				timesheetId: timesheet.id,
				segmentId,
				taskId: body.taskId,
				workDate: workDateObj,
				workMode: body.workMode,
				provenance: body.provenance,
				elapsedMinutes: body.durationMinutes,
				claimedMinutes: netMinutes,
				observedMinutes: isDeepWork || body.provenance === "manual_entry" ? 0 : netMinutes,
				supportedMinutes: netMinutes,
				approvedBillableMinutes: 0,
				appliedRateVersionId: rateVersionId,
				snapshotHourlyRate: body.hourlyRate,
				lineStatus: body.provenance === "manual_entry" ? "needs_clarification" : "pending_review",
				developerNote: body.developerNote
			} });
			await tx.auditEntry.create({ data: {
				tenantId: body.tenantId,
				actorUserId: body.userId,
				actionType: body.provenance === "manual_entry" ? "MANUAL_TIME_ENTRY_ADDED" : "WORK_SESSION_RECORDED",
				targetEntity: `timesheet_lines:${line.id}`,
				targetId: line.id,
				reason: body.manualReason ?? `Recorded ${netMinutes}m in ${body.workMode} mode`
			} });
			return {
				lineId: line.id,
				timesheetId: timesheet.id
			};
		})
	};
}
// src/server/prismaDesktopHandlers.ts
function buildDeveloperPairingToken(userId) {
	return `dp_live_${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}_sync`;
}
function getSupabaseAnonClient() {
	const url = process.env.VITE_SUPABASE_URL || "";
	const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
	if (!url || !key) return null;
	return createClient(url, key, { auth: {
		autoRefreshToken: false,
		persistSession: false
	} });
}
function getSupabaseAdminClient() {
	const url = process.env.VITE_SUPABASE_URL || "";
	const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
	if (!url || !serviceKey) return null;
	return createClient(url, serviceKey, { auth: {
		autoRefreshToken: false,
		persistSession: false
	} });
}
async function resolveMembershipAndDevice(params) {
	const memberships = await prisma.membership.findMany({
		where: { userId: params.userId },
		include: {
			user: true,
			tenant: true,
			roleGrants: true
		},
		orderBy: { createdAt: "desc" }
	});
	if (memberships.length === 0) return {
		ok: false,
		statusCode: 403,
		error: "No workspace membership found for this account. Ask your Tenant Owner to invite you first."
	};
	const membership = memberships.find((m) => m.status === "active") ?? memberships.find((m) => m.status === "invited") ?? memberships[0];
	if (membership.status === "suspended" || membership.status === "revoked") return {
		ok: false,
		statusCode: 403,
		error: `Your workspace membership is currently ${membership.status}. Contact your Tenant Owner.`
	};
	const mustChangePassword = membership.status === "invited" || Boolean(params.mustChangePasswordHint);
	const pairingToken = buildDeveloperPairingToken(membership.userId);
	const deviceName = params.deviceName?.trim() || "TikTrack Desktop Workstation";
	const osPlatform = params.osPlatform?.trim() || "macos";
	const agentVersion = params.agentVersion?.trim() || "0.3.0";
	const existingDevice = await prisma.device.findFirst({
		where: {
			tenantId: membership.tenantId,
			userId: membership.userId,
			revokedAt: null
		},
		orderBy: { lastSeenAt: "desc" }
	});
	let deviceId;
	if (existingDevice) deviceId = (await prisma.device.update({
		where: { id: existingDevice.id },
		data: {
			deviceName,
			osPlatform,
			agentVersion,
			lastSeenAt: /* @__PURE__ */ new Date()
		}
	})).id;
	else deviceId = (await prisma.device.create({ data: {
		tenantId: membership.tenantId,
		userId: membership.userId,
		deviceName,
		osPlatform,
		agentVersion,
		deviceFingerprintHash: pairingToken,
		updateChannel: "stable",
		multiDisplayPolicy: "coarse_metadata_only"
	} })).id;
	return {
		ok: true,
		statusCode: 200,
		user: {
			id: membership.userId,
			email: membership.user.email,
			name: membership.user.fullName,
			role: membership.roleGrants[0]?.role ?? "developer",
			status: membership.status,
			mustChangePassword
		},
		tenant: {
			id: membership.tenantId,
			name: membership.tenant.name,
			slug: membership.tenant.slug
		},
		deviceId,
		pairingToken
	};
}
async function handleDesktopAuth(body) {
	if (body.mode === "password") {
		const email = (body.email ?? "").trim().toLowerCase();
		const password = body.password ?? "";
		if (!email || !password) return {
			ok: false,
			statusCode: 400,
			error: "Email and password are required."
		};
		const supa = getSupabaseAnonClient();
		if (!supa) return {
			ok: false,
			statusCode: 500,
			error: "Supabase Auth is not configured on the server."
		};
		const { data, error } = await supa.auth.signInWithPassword({
			email,
			password
		});
		if (error || !data.user || !data.session) return {
			ok: false,
			statusCode: 401,
			error: error?.message || "Invalid email or password."
		};
		const profile = await prisma.userProfile.findUnique({ where: { id: data.user.id } }) ?? await prisma.userProfile.findFirst({ where: { email: {
			equals: email,
			mode: "insensitive"
		} } });
		if (!profile) return {
			ok: false,
			statusCode: 403,
			error: "Account is not linked to a TikTrack workspace yet. Please complete onboarding or contact your Tenant Owner."
		};
		const metaMustChange = Boolean(data.user.user_metadata?.mustChangePassword);
		const resolved = await resolveMembershipAndDevice({
			userId: profile.id,
			deviceName: body.deviceName,
			osPlatform: body.osPlatform,
			agentVersion: body.agentVersion,
			mustChangePasswordHint: metaMustChange
		});
		if (!resolved.ok) return resolved;
		return {
			ok: true,
			statusCode: 200,
			accessToken: data.session.access_token,
			user: resolved.user,
			tenant: resolved.tenant,
			deviceId: resolved.deviceId,
			pairingToken: resolved.pairingToken
		};
	}
	if (body.mode === "pairing_token") {
		const token = (body.token ?? "").trim();
		if (!token) return {
			ok: false,
			statusCode: 400,
			error: "Device pairing token is required."
		};
		let matchedUserId = null;
		const matchedDevice = await prisma.device.findFirst({
			where: {
				deviceFingerprintHash: token,
				revokedAt: null
			},
			orderBy: { lastSeenAt: "desc" }
		});
		if (matchedDevice) matchedUserId = matchedDevice.userId;
		if (!matchedUserId && token.startsWith("dp_live_") && token.endsWith("_sync")) {
			const found = (await prisma.userProfile.findMany({ select: { id: true } })).find((p) => buildDeveloperPairingToken(p.id) === token);
			if (found) matchedUserId = found.id;
		}
		if (!matchedUserId) return {
			ok: false,
			statusCode: 401,
			error: "Invalid or revoked device pairing token. Copy a fresh token from Integrations & Devices."
		};
		const resolved = await resolveMembershipAndDevice({
			userId: matchedUserId,
			deviceName: body.deviceName,
			osPlatform: body.osPlatform,
			agentVersion: body.agentVersion
		});
		if (!resolved.ok) return resolved;
		if (resolved.user.mustChangePassword || resolved.user.status === "invited") return {
			ok: false,
			statusCode: 403,
			requiresActivation: true,
			error: "Your profile is not active yet. Please sign in with your email and temporary password first to change your password and activate your account."
		};
		return {
			ok: true,
			statusCode: 200,
			accessToken: token,
			user: resolved.user,
			tenant: resolved.tenant,
			deviceId: resolved.deviceId,
			pairingToken: resolved.pairingToken
		};
	}
	return {
		ok: false,
		statusCode: 400,
		error: "Unsupported auth mode."
	};
}
async function handleDesktopActivatePassword(body) {
	if (!isValidUuid(body.tenantId) || !isValidUuid(body.userId)) return {
		ok: false,
		statusCode: 400,
		error: "Valid tenantId and userId are required."
	};
	const newPassword = (body.newPassword ?? "").trim();
	if (newPassword.length < 6) return {
		ok: false,
		statusCode: 400,
		error: "New password must be at least 6 characters long."
	};
	const admin = getSupabaseAdminClient();
	if (admin) {
		const { error } = await admin.auth.admin.updateUserById(body.userId, {
			password: newPassword,
			user_metadata: { mustChangePassword: false }
		});
		if (error) return {
			ok: false,
			statusCode: 400,
			error: `Password update failed: ${error.message}`
		};
	} else if (body.accessToken && process.env.VITE_SUPABASE_URL) {
		const apiKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
		const resp = await fetch(`${process.env.VITE_SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/user`, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
				apikey: apiKey,
				Authorization: `Bearer ${body.accessToken}`
			},
			body: JSON.stringify({
				password: newPassword,
				data: { mustChangePassword: false }
			})
		});
		if (!resp.ok) return {
			ok: false,
			statusCode: 400,
			error: `Password update failed: ${await resp.text()}`
		};
	}
	await prisma.$transaction(async (tx) => {
		await tx.membership.update({
			where: { tenantId_userId: {
				tenantId: body.tenantId,
				userId: body.userId
			} },
			data: {
				status: "active",
				joinedAt: /* @__PURE__ */ new Date()
			}
		});
		await tx.auditEntry.create({ data: {
			tenantId: body.tenantId,
			actorUserId: body.userId,
			actionType: "FIRST_LOGIN_PASSWORD_CHANGED",
			targetEntity: `memberships:${body.userId}`,
			targetId: body.userId,
			reason: "Activated invited profile via Desktop Agent first-login password change."
		} });
	});
	return {
		ok: true,
		statusCode: 200,
		status: "active",
		mustChangePassword: false,
		message: "Password updated! Your profile is now active and eligible for task assignments."
	};
}
async function handleDesktopFetchTasks(params) {
	if (!isValidUuid(params.tenantId) || !isValidUuid(params.userId)) return {
		ok: false,
		statusCode: 400,
		error: "Valid tenantId and userId are required."
	};
	const membership = await prisma.membership.findUnique({
		where: { tenantId_userId: {
			tenantId: params.tenantId,
			userId: params.userId
		} },
		include: { roleGrants: true }
	});
	if (!membership) return {
		ok: false,
		statusCode: 403,
		error: "Membership not found in this tenant."
	};
	if (membership.status !== "active") return {
		ok: false,
		statusCode: 403,
		requiresActivation: membership.status === "invited",
		error: membership.status === "invited" ? "Profile is pending activation. Change your temporary password first." : `Membership is ${membership.status}.`
	};
	return {
		ok: true,
		statusCode: 200,
		tasks: (await prisma.task.findMany({
			where: {
				tenantId: params.tenantId,
				assignments: { some: { userId: params.userId } }
			},
			include: { project: { select: {
				id: true,
				code: true,
				name: true,
				status: true
			} } },
			orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
		})).filter((t) => t.project.status !== "archived").map((t) => ({
			id: t.id,
			projectId: t.projectId,
			projectCode: t.project.code,
			projectName: t.project.name,
			code: t.code,
			title: t.title,
			status: t.status,
			priority: t.priority,
			estimateMinutes: t.estimateMinutes,
			defaultWorkMode: t.defaultWorkMode,
			dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null
		}))
	};
}
async function handleDesktopSubmitSession(body) {
	if (!isValidUuid(body.tenantId) || !isValidUuid(body.userId) || !isValidUuid(body.projectId) || !isValidUuid(body.taskId)) return {
		ok: false,
		statusCode: 400,
		error: "Valid tenantId, userId, projectId, and taskId are required."
	};
	const membership = await prisma.membership.findUnique({
		where: { tenantId_userId: {
			tenantId: body.tenantId,
			userId: body.userId
		} },
		include: { roleGrants: true }
	});
	if (!membership || membership.status !== "active") return {
		ok: false,
		statusCode: 403,
		error: "Only active workspace members can submit work sessions."
	};
	const assignment = await prisma.taskAssignment.findFirst({ where: {
		tenantId: body.tenantId,
		taskId: body.taskId,
		userId: body.userId
	} });
	const isOwner = membership.roleGrants.some((rg) => rg.role === "tenant_owner");
	if (!assignment && !isOwner) return {
		ok: false,
		statusCode: 403,
		error: "You are not assigned to this task. Select an assigned task to submit work."
	};
	const endDate = body.endedAtUtc ? new Date(body.endedAtUtc) : /* @__PURE__ */ new Date();
	const durationMinutes = Math.max(1, Math.round(body.elapsedSeconds / 60));
	const breakMinutes = Math.max(0, Math.round(body.breakSeconds / 60));
	const startDate = body.startedAtUtc ? new Date(body.startedAtUtc) : /* @__PURE__ */ new Date(endDate.getTime() - durationMinutes * 6e4);
	const workDate = startDate.toISOString().slice(0, 10);
	const startTime = startDate.toISOString().slice(11, 16);
	const endTime = (endDate.getTime() <= startDate.getTime() + 6e4 ? new Date(startDate.getTime() + 6e4) : endDate).toISOString().slice(11, 16);
	const recorded = await handleRecordSession({
		tenantId: body.tenantId,
		userId: body.userId,
		projectId: body.projectId,
		taskId: body.taskId,
		workDate,
		startTime,
		endTime: endTime === startTime ? "23:59" : endTime,
		durationMinutes,
		breakMinutes: Math.min(breakMinutes, Math.max(0, durationMinutes - 1)),
		workMode: body.workMode || "coding",
		provenance: "desktop_timer",
		developerNote: body.developerNote?.trim() || `Submitted from TikTrack Desktop Agent (${durationMinutes}m)`,
		hourlyRate: 75
	});
	if (!recorded.ok) return {
		ok: false,
		statusCode: 400,
		error: recorded.error || "Failed to record session."
	};
	if (body.markTaskForReview) await prisma.task.update({
		where: { id: body.taskId },
		data: { status: "review" }
	});
	if (body.submitTimesheet && "timesheetId" in recorded && recorded.timesheetId) await prisma.timesheet.update({
		where: { id: recorded.timesheetId },
		data: {
			status: "submitted",
			submittedAtUtc: /* @__PURE__ */ new Date()
		}
	});
	if (body.deviceId && isValidUuid(body.deviceId)) await prisma.device.update({
		where: { id: body.deviceId },
		data: { lastSeenAt: /* @__PURE__ */ new Date() }
	}).catch(() => {});
	return {
		ok: true,
		statusCode: 201,
		lineId: "lineId" in recorded ? recorded.lineId : void 0,
		timesheetId: "timesheetId" in recorded ? recorded.timesheetId : void 0,
		taskStatus: body.markTaskForReview ? "review" : "active"
	};
}
// src/server/geminiService.ts
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
function getGeminiConfig() {
	const apiKey = (process.env.GEMINI_API_KEY || "").trim();
	const model = (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();
	return {
		configured: apiKey.length > 0 && apiKey !== "your-gemini-api-key",
		apiKey,
		model
	};
}
const TARGET_INSTRUCTIONS = {
	daily_summary: "Write a concise Daily Work Summary (3-5 bullet points) describing the logged time, work modes used, and linked work proof for the developer to review before submitting.",
	reviewer_digest: "Write a concise Manager Review Brief (3-5 bullet points) summarizing logged vs. supported time, linked deliverables, and any open items awaiting human confirmation.",
	gap_explanation: "Write a polite, clear Quiet-Gap Note prompt explaining why a quiet period needs a quick label (e.g., Thinking, Reading Docs, Meeting, or Break) and reminding that no automatic pay cuts occur.",
	task_mapping: "Write a concise Task Match Summary explaining how the repository/branch metadata aligns with the target task, noting that developer confirmation is required.",
	debug_investigation: "Write a concise Debugging Recap summarizing debugging & local testing progress from lifecycle metadata without assuming or inventing code changes.",
	pattern_cluster: "Write a constructive Work Pattern Recap grouping recurring review notices and suggesting practical workflow improvements (like selecting Deep Work mode upfront)."
};
async function generateGeminiSummaryDraft(input) {
	const { configured, apiKey, model } = getGeminiConfig();
	if (!configured) return {
		ok: false,
		configured: false,
		modelId: model,
		error: "GEMINI_API_KEY is not configured in the server environment."
	};
	const systemInstruction = [
		"You are TikTrack Smart Assistant for a privacy-first engineering time tracker.",
		"Rules you MUST strictly obey:",
		"1. Only use the sanitized metadata provided in JSON. Never invent commits, bugs, or hours.",
		"2. Never accuse any developer of fraud, idleness, slacking, or low performance.",
		"3. Never recommend automatic pay deductions or punitive actions; human review is always authoritative.",
		"4. Use clear, plain, everyday English — avoid technical jargon.",
		"5. Output clean Markdown (a short bold title + 3 to 5 concise bullets). Keep it under 160 words."
	].join("\n");
	const taskInstruction = TARGET_INSTRUCTIONS[input.targetType] ?? "Write a clear, concise summary of the provided work metadata.";
	const userPrompt = [
		`Target: ${input.targetLabel}`,
		`Draft Type: ${input.targetType}`,
		`Instruction: ${taskInstruction}`,
		`Verified Metadata (JSON):`,
		JSON.stringify(input.sanitizedPayload, null, 2)
	].join("\n\n");
	const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
	try {
		const response = await fetch(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				system_instruction: { parts: [{ text: systemInstruction }] },
				contents: [{
					role: "user",
					parts: [{ text: userPrompt }]
				}],
				generationConfig: {
					temperature: .35,
					maxOutputTokens: 512
				}
			})
		});
		if (!response.ok) {
			const errBody = await response.text().catch(() => "");
			let errMsg = `Gemini API error (${response.status})`;
			try {
				const parsed = JSON.parse(errBody);
				if (parsed.error?.message) errMsg = parsed.error.message;
			} catch {}
			return {
				ok: false,
				configured: true,
				modelId: model,
				error: errMsg
			};
		}
		const data = await response.json();
		const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
		if (!text) return {
			ok: false,
			configured: true,
			modelId: model,
			error: "Gemini returned an empty response."
		};
		return {
			ok: true,
			configured: true,
			modelId: model,
			draftMarkdown: `${text}${input.citedIds.length > 0 ? `\n\n_Sources cited: ${input.citedIds.join(", ")}_` : ""}`,
			tokensUsed: data.usageMetadata?.totalTokenCount ?? Math.max(80, Math.round(text.length / 3))
		};
	} catch (err) {
		return {
			ok: false,
			configured: true,
			modelId: model,
			error: err instanceof Error ? err.message : "Failed to reach Gemini API."
		};
	}
}
// src/server/prismaApiPlugin.ts
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
async function readJsonBody(req) {
	const preParsed = req.body;
	if (preParsed !== void 0) {
		if (typeof preParsed === "string") return preParsed ? JSON.parse(preParsed) : {};
		return preParsed;
	}
	return new Promise((resolve, reject) => {
		let raw = "";
		req.on("data", (chunk) => {
			raw += chunk.toString("utf8");
		});
		req.on("end", () => {
			try {
				resolve(raw ? JSON.parse(raw) : {});
			} catch (err) {
				reject(err instanceof Error ? err : new Error(String(err)));
			}
		});
		req.on("error", (err) => {
			reject(err instanceof Error ? err : new Error(String(err)));
		});
	});
}
function sendJson(res, statusCode, payload) {
	res.statusCode = statusCode;
	res.setHeader("Content-Type", "application/json");
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
	res.end(JSON.stringify(payload));
	return true;
}
async function handlePrismaApiRequest(req, res) {
	const url = req.url ?? "";
	if (!url.startsWith("/api/prisma/")) return false;
	if (req.method === "OPTIONS") {
		res.statusCode = 204;
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
		res.end();
		return true;
	}
	try {
		if (req.method === "POST" && url.startsWith("/api/prisma/desktop/auth")) {
			const result = await handleDesktopAuth(await readJsonBody(req));
			return sendJson(res, result.statusCode ?? 200, result);
		}
		if (req.method === "POST" && url.startsWith("/api/prisma/desktop/activate-password")) {
			const result = await handleDesktopActivatePassword(await readJsonBody(req));
			return sendJson(res, result.statusCode ?? 200, result);
		}
		if (req.method === "GET" && url.startsWith("/api/prisma/desktop/tasks")) {
			const parsed = new URL(url, "http://localhost");
			const result = await handleDesktopFetchTasks({
				tenantId: parsed.searchParams.get("tenantId") ?? "",
				userId: parsed.searchParams.get("userId") ?? ""
			});
			return sendJson(res, result.statusCode ?? 200, result);
		}
		if (req.method === "POST" && url.startsWith("/api/prisma/desktop/sessions/submit")) {
			const result = await handleDesktopSubmitSession(await readJsonBody(req));
			return sendJson(res, result.statusCode ?? 200, result);
		}
		if (req.method === "GET" && url.startsWith("/api/prisma/status")) return sendJson(res, 200, await checkPrismaConnection());
		if (req.method === "GET" && url.startsWith("/api/prisma/bootstrap")) return sendJson(res, 200, await handleBootstrap());
		if (req.method === "POST" && url.startsWith("/api/prisma/tenants")) {
			const body = await readJsonBody(req);
			const tenantResult = await handleCreateTenant(body);
			if (!body.skipOwnerInvite) sendWorkspaceInviteEmail({
				email: body.ownerEmail,
				name: body.ownerName,
				role: "tenant_owner",
				tenantId: tenantResult.tenantId,
				tenantName: body.name
			}).catch((err) => {
				console.warn("[EmailService] Owner welcome email dispatch error:", err);
			});
			return sendJson(res, 201, tenantResult);
		}
		if (req.method === "PATCH" && url.startsWith("/api/prisma/tenant/settings")) {
			const body = await readJsonBody(req);
			if (!isValidUuid(body.tenantId)) return sendJson(res, 200, { ok: false });
			await prisma.tenantSettings.update({
				where: { tenantId: body.tenantId },
				data: {
					...body.roundingRule ? { roundingRule: body.roundingRule } : {},
					...body.paidBreakMinutesPerDay !== void 0 ? { paidBreakAllowanceMinutes: body.paidBreakMinutesPerDay } : {},
					...body.weeklyCapMinutes !== void 0 ? { weeklyCapMinutes: body.weeklyCapMinutes } : {}
				}
			});
			return sendJson(res, 200, { ok: true });
		}
		if (req.method === "POST" && url.startsWith("/api/prisma/auth/owner-signup")) {
			const body = await readJsonBody(req);
			const email = (body.email ?? "").trim().toLowerCase();
			if (!email || !body.password || body.password.length < 6) return sendJson(res, 400, {
				ok: false,
				message: "Valid email and password (minimum 6 characters) are required."
			});
			const emailResult = await sendOwnerSignupVerificationEmail({
				email,
				password: body.password,
				fullName: body.fullName || email.split("@")[0],
				timezone: body.timezone,
				countryCode: body.countryCode,
				countryName: body.countryName,
				redirectTo: body.redirectTo
			});
			return sendJson(res, emailResult.ok ? 200 : 400, emailResult);
		}
		if (req.method === "POST" && url.startsWith("/api/prisma/auth/reset-password")) {
			const body = await readJsonBody(req);
			const email = (body.email ?? "").trim().toLowerCase();
			if (!email) return sendJson(res, 400, {
				ok: false,
				message: "Email address is required."
			});
			const emailResult = await sendPasswordRecoveryEmail({
				email,
				redirectTo: body.redirectTo
			});
			return sendJson(res, emailResult.ok ? 200 : 500, emailResult);
		}
		if (req.method === "POST" && url.startsWith("/api/prisma/members/resend-invite")) {
			const body = await readJsonBody(req);
			if (!isValidUuid(body.tenantId) || !isValidUuid(body.userId)) return sendJson(res, 200, {
				ok: false,
				message: "Invalid tenant or user ID"
			});
			const member = await prisma.membership.findUnique({
				where: { tenantId_userId: {
					tenantId: body.tenantId,
					userId: body.userId
				} },
				include: {
					user: true,
					tenant: true,
					roleGrants: true
				}
			});
			if (!member || !member.user) return sendJson(res, 404, {
				ok: false,
				message: "Member not found"
			});
			const role = member.roleGrants[0]?.role || "developer";
			const freshTempPassword = body.temporaryPassword?.trim() || (member.status === "invited" ? `TT-${crypto$1.randomBytes(4).toString("hex")}!` : void 0);
			const emailResult = await sendWorkspaceInviteEmail({
				email: member.user.email,
				name: member.user.fullName,
				role,
				tenantId: body.tenantId,
				tenantName: member.tenant?.name,
				temporaryPassword: freshTempPassword
			});
			await prisma.auditEntry.create({ data: {
				tenantId: body.tenantId,
				actionType: "INVITE_RESENT",
				targetEntity: `memberships:${member.user.email}`,
				reason: `Resent invitation email to ${member.user.email} via Resend`
			} });
			return sendJson(res, 200, {
				ok: emailResult.ok,
				emailSent: emailResult.ok,
				message: emailResult.message,
				temporaryPassword: freshTempPassword
			});
		}
		if (req.method === "POST" && url.startsWith("/api/prisma/members") && !url.includes("/status") && !url.includes("/resend-invite")) {
			const body = await readJsonBody(req);
			if (!isValidUuid(body.tenantId) || !body.email?.trim() || !body.name?.trim()) return sendJson(res, 400, {
				ok: false,
				error: "Valid tenantId, name, and email are required."
			});
			const normalizedEmail = body.email.toLowerCase().trim();
			const effectiveTempPassword = body.temporaryPassword?.trim() || `TT-${crypto$1.randomBytes(4).toString("hex")}!`;
			try {
				const tenantRecord = await prisma.tenant.findUnique({
					where: { id: body.tenantId },
					select: { name: true }
				});
				const authProvision = await ensureSupabaseAuthUser({
					email: normalizedEmail,
					name: body.name.trim(),
					role: body.role,
					tenantId: body.tenantId,
					tenantName: tenantRecord?.name,
					temporaryPassword: effectiveTempPassword
				});
				let resolvedUserId = "";
				await prisma.$transaction(async (tx) => {
					const existingUser = (authProvision.userId ? await tx.userProfile.findUnique({ where: { id: authProvision.userId } }) : null) || await tx.userProfile.findFirst({ where: { email: {
						equals: normalizedEmail,
						mode: "insensitive"
					} } });
					if (existingUser) {
						resolvedUserId = existingUser.id;
						if (body.name.trim() && existingUser.fullName !== body.name.trim()) await tx.userProfile.update({
							where: { id: existingUser.id },
							data: { fullName: body.name.trim() }
						});
					} else {
						resolvedUserId = authProvision.userId || crypto$1.randomUUID();
						await tx.userProfile.create({ data: {
							id: resolvedUserId,
							email: normalizedEmail,
							fullName: body.name.trim()
						} });
					}
					const existingMem = await tx.membership.findFirst({
						where: {
							tenantId: body.tenantId,
							userId: resolvedUserId
						},
						include: { roleGrants: true }
					});
					let targetMembershipId = "";
					if (existingMem) {
						targetMembershipId = existingMem.id;
						await tx.membership.update({
							where: { id: existingMem.id },
							data: {
								status: "invited",
								invitedEmail: normalizedEmail
							}
						});
						await tx.roleGrant.deleteMany({ where: {
							tenantId: body.tenantId,
							membershipId: existingMem.id,
							projectScopeId: null
						} });
						await tx.roleGrant.create({ data: {
							tenantId: body.tenantId,
							membershipId: existingMem.id,
							role: body.role
						} });
					} else {
						const mem = await tx.membership.create({ data: {
							tenantId: body.tenantId,
							userId: resolvedUserId,
							status: "invited",
							invitedEmail: normalizedEmail,
							joinedAt: /* @__PURE__ */ new Date()
						} });
						targetMembershipId = mem.id;
						await tx.roleGrant.create({ data: {
							tenantId: body.tenantId,
							membershipId: mem.id,
							role: body.role
						} });
					}
					if (Array.isArray(body.customPermissions) && body.customPermissions.length > 0 && targetMembershipId) {
						const validPerms = await tx.permission.findMany({
							where: {
								key: { in: body.customPermissions },
								isSuperAdminOnly: false
							},
							select: { key: true }
						});
						await tx.memberPermissionGrant.deleteMany({ where: {
							membershipId: targetMembershipId,
							tenantId: body.tenantId
						} });
						if (validPerms.length > 0) await tx.memberPermissionGrant.createMany({
							data: validPerms.map((p) => ({
								membershipId: targetMembershipId,
								tenantId: body.tenantId,
								permissionKey: p.key
							})),
							skipDuplicates: true
						});
					}
					await tx.auditEntry.create({ data: {
						tenantId: body.tenantId,
						actionType: "MEMBER_INVITED",
						targetEntity: `memberships:${normalizedEmail}`,
						reason: `Invited ${body.name} with role ${body.role} (temporary password issued)`
					} });
				});
				const emailResult = await sendWorkspaceInviteEmail({
					email: normalizedEmail,
					name: body.name.trim(),
					role: body.role,
					tenantId: body.tenantId,
					tenantName: tenantRecord?.name,
					temporaryPassword: effectiveTempPassword,
					skipAuthProvision: true
				});
				return sendJson(res, 201, {
					ok: true,
					userId: resolvedUserId,
					temporaryPassword: effectiveTempPassword,
					emailSent: emailResult.ok,
					emailMessage: emailResult.message
				});
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				console.error("[API] /api/prisma/members error:", message);
				return sendJson(res, 500, {
					ok: false,
					error: message
				});
			}
		}
		if (req.method === "PATCH" && url.startsWith("/api/prisma/members/status")) {
			const body = await readJsonBody(req);
			if (!isValidUuid(body.tenantId) || !isValidUuid(body.userId)) return sendJson(res, 200, { ok: false });
			await prisma.membership.update({
				where: { tenantId_userId: {
					tenantId: body.tenantId,
					userId: body.userId
				} },
				data: {
					status: body.status,
					...body.status === "active" ? { joinedAt: /* @__PURE__ */ new Date() } : {}
				}
			});
			return sendJson(res, 200, { ok: true });
		}
		if (req.method === "DELETE" && url.startsWith("/api/prisma/members")) {
			const body = await readJsonBody(req);
			if (!isValidUuid(body.tenantId) || !isValidUuid(body.userId)) return sendJson(res, 400, {
				ok: false,
				error: "Valid tenantId and userId are required."
			});
			try {
				await prisma.$transaction(async (tx) => {
					await tx.taskAssignment.deleteMany({ where: {
						userId: body.userId,
						task: { tenantId: body.tenantId }
					} });
					await tx.taskNote.deleteMany({ where: {
						authorId: body.userId,
						task: { tenantId: body.tenantId }
					} });
					await tx.timeSegment.deleteMany({ where: {
						userId: body.userId,
						tenantId: body.tenantId
					} });
					await tx.workSession.deleteMany({ where: {
						userId: body.userId,
						tenantId: body.tenantId
					} });
					await tx.disputeMessage.deleteMany({ where: { authorUserId: body.userId } });
					await tx.dispute.deleteMany({ where: {
						openedByUserId: body.userId,
						timesheetLine: { tenantId: body.tenantId }
					} });
					await tx.timesheetLine.deleteMany({ where: { timesheet: {
						userId: body.userId,
						tenantId: body.tenantId
					} } });
					await tx.timesheet.deleteMany({ where: {
						userId: body.userId,
						tenantId: body.tenantId
					} });
					await tx.activityEvent.deleteMany({ where: {
						userId: body.userId,
						tenantId: body.tenantId
					} });
					await tx.activityEventBatch.deleteMany({ where: {
						userId: body.userId,
						tenantId: body.tenantId
					} });
					await tx.notification.deleteMany({ where: {
						recipientUserId: body.userId,
						tenantId: body.tenantId
					} });
					await tx.policyConsent.deleteMany({ where: {
						userId: body.userId,
						tenantId: body.tenantId
					} });
					await tx.ideWorkspaceMapping.deleteMany({ where: {
						userId: body.userId,
						tenantId: body.tenantId
					} });
					await tx.device.deleteMany({ where: {
						userId: body.userId,
						tenantId: body.tenantId
					} });
					const mem = await tx.membership.findFirst({ where: {
						tenantId: body.tenantId,
						userId: body.userId
					} });
					if (mem) {
						await tx.memberPermissionGrant.deleteMany({ where: { membershipId: mem.id } });
						await tx.roleGrant.deleteMany({ where: { membershipId: mem.id } });
						await tx.membership.delete({ where: { id: mem.id } });
					}
					if (await tx.membership.count({ where: { userId: body.userId } }) === 0) await tx.userProfile.deleteMany({ where: { id: body.userId } });
					await tx.auditEntry.create({ data: {
						tenantId: body.tenantId,
						actionType: "MEMBER_CASCADE_DELETED",
						targetEntity: `users:${body.userId}`,
						reason: `Permanently removed member and cascade-deleted all associated timesheets, sessions, and activity events.`
					} });
				});
				return sendJson(res, 200, {
					ok: true,
					message: "Member and all associated data permanently deleted with cascade cleanup."
				});
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				console.error("[API] DELETE /api/prisma/members error:", message);
				return sendJson(res, 500, {
					ok: false,
					error: message
				});
			}
		}
		if (req.method === "POST" && url.startsWith("/api/prisma/projects")) {
			const body = await readJsonBody(req);
			if (!isValidUuid(body.tenantId)) return sendJson(res, 200, {
				ok: false,
				error: "Non-UUID tenant ID"
			});
			const created = await prisma.$transaction(async (tx) => {
				const proj = await tx.project.create({ data: {
					tenantId: body.tenantId,
					code: body.code.toUpperCase(),
					name: body.name,
					clientName: body.clientName,
					description: body.description,
					status: "active",
					createdBy: isValidUuid(body.actorUserId) ? body.actorUserId : null
				} });
				await tx.auditEntry.create({ data: {
					tenantId: body.tenantId,
					actorUserId: isValidUuid(body.actorUserId) ? body.actorUserId : null,
					actionType: "PROJECT_CREATED",
					targetEntity: `projects:${proj.code}`,
					targetId: proj.id,
					reason: `Created project ${proj.name} via Prisma ORM`
				} });
				return proj;
			});
			return sendJson(res, 201, {
				ok: true,
				project: {
					id: created.id,
					tenantId: created.tenantId,
					code: created.code,
					name: created.name,
					clientName: created.clientName,
					status: created.status,
					description: created.description ?? ""
				}
			});
		}
		if (req.method === "POST" && url.startsWith("/api/prisma/tasks") && !url.includes("/status") && !url.includes("/assign")) {
			const body = await readJsonBody(req);
			if (!isValidUuid(body.tenantId) || !isValidUuid(body.projectId)) return sendJson(res, 200, {
				ok: false,
				error: "Non-UUID IDs"
			});
			const requestedAssignees = (body.assignedMemberIds ?? []).filter(isValidUuid);
			if (requestedAssignees.length > 0) {
				const activeMemberships = await prisma.membership.findMany({
					where: {
						tenantId: body.tenantId,
						userId: { in: requestedAssignees },
						status: "active"
					},
					select: { userId: true }
				});
				const activeIds = new Set(activeMemberships.map((m) => m.userId));
				if (requestedAssignees.filter((id) => !activeIds.has(id)).length > 0) return sendJson(res, 400, {
					ok: false,
					error: "Cannot assign tasks to pending or inactive members. They must change their temporary password and activate their profile first."
				});
			}
			const created = await prisma.$transaction(async (tx) => {
				const tsk = await tx.task.create({ data: {
					tenantId: body.tenantId,
					projectId: body.projectId,
					parentTaskId: isValidUuid(body.parentTaskId) ? body.parentTaskId : null,
					code: body.code.toUpperCase(),
					title: body.title,
					acceptanceCriteria: body.acceptanceCriteria,
					status: body.status,
					priority: body.priority,
					estimateMinutes: body.estimateMinutes,
					isBillable: body.isBillable,
					defaultWorkMode: body.defaultWorkMode,
					dueDate: body.dueDate ? new Date(body.dueDate) : null
				} });
				for (const userId of requestedAssignees) await tx.taskAssignment.create({ data: {
					tenantId: body.tenantId,
					projectId: body.projectId,
					taskId: tsk.id,
					userId
				} });
				return tsk;
			});
			return sendJson(res, 201, {
				ok: true,
				task: {
					id: created.id,
					tenantId: created.tenantId,
					projectId: created.projectId,
					parentTaskId: created.parentTaskId ?? void 0,
					code: created.code,
					title: created.title,
					acceptanceCriteria: created.acceptanceCriteria,
					status: created.status,
					priority: created.priority,
					estimateMinutes: created.estimateMinutes,
					isBillable: created.isBillable,
					defaultWorkMode: created.defaultWorkMode,
					assignedMemberIds: body.assignedMemberIds ?? [],
					dueDate: created.dueDate ? created.dueDate.toISOString().slice(0, 10) : body.dueDate,
					attachments: []
				}
			});
		}
		if (req.method === "PATCH" && url.startsWith("/api/prisma/tasks/status")) {
			const body = await readJsonBody(req);
			if (!isValidUuid(body.taskId)) return sendJson(res, 200, { ok: false });
			await prisma.task.update({
				where: { id: body.taskId },
				data: { status: body.status }
			});
			return sendJson(res, 200, { ok: true });
		}
		if (req.method === "PATCH" && url.startsWith("/api/prisma/tasks/assign")) {
			const body = await readJsonBody(req);
			if (!isValidUuid(body.taskId) || !isValidUuid(body.tenantId) || !isValidUuid(body.projectId)) return sendJson(res, 200, { ok: false });
			const candidateAssignees = (body.assignedMemberIds ?? []).filter(isValidUuid);
			if (candidateAssignees.length > 0) {
				const activeMemberships = await prisma.membership.findMany({
					where: {
						tenantId: body.tenantId,
						userId: { in: candidateAssignees },
						status: "active"
					},
					select: { userId: true }
				});
				const activeIds = new Set(activeMemberships.map((m) => m.userId));
				if (candidateAssignees.filter((id) => !activeIds.has(id)).length > 0) return sendJson(res, 400, {
					ok: false,
					error: "Cannot assign tasks to pending or inactive members. They must change their temporary password and activate their profile first."
				});
			}
			await prisma.$transaction(async (tx) => {
				await tx.taskAssignment.deleteMany({ where: {
					tenantId: body.tenantId,
					taskId: body.taskId
				} });
				for (const userId of candidateAssignees) await tx.taskAssignment.create({ data: {
					tenantId: body.tenantId,
					projectId: body.projectId,
					taskId: body.taskId,
					userId
				} });
			});
			return sendJson(res, 200, { ok: true });
		}
		if (req.method === "POST" && url.startsWith("/api/prisma/sessions/record")) return sendJson(res, 201, await handleRecordSession(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/timesheets/submit")) {
			const body = await readJsonBody(req);
			if (!isValidUuid(body.timesheetId)) return sendJson(res, 200, { ok: false });
			await prisma.timesheet.update({
				where: { id: body.timesheetId },
				data: {
					status: "submitted",
					submittedAt: /* @__PURE__ */ new Date(),
					developerSummaryNote: body.summaryNote ?? ""
				}
			});
			return sendJson(res, 200, { ok: true });
		}
		if (req.method === "POST" && url.startsWith("/api/prisma/timesheets/review")) {
			const body = await readJsonBody(req);
			if (!isValidUuid(body.lineId) || !isValidUuid(body.timesheetId) || !isValidUuid(body.reviewerUserId)) return sendJson(res, 200, { ok: false });
			const nextStatus = body.decision === "approve" ? "approved" : body.decision === "adjust_with_reason" ? "adjusted_approved" : body.decision === "ask_clarification" ? "needs_clarification" : "rejected";
			await prisma.$transaction(async (tx) => {
				const prevLine = await tx.timesheetLine.findUniqueOrThrow({
					where: { id: body.lineId },
					include: { timesheet: true }
				});
				await tx.timesheetLine.update({
					where: { id: body.lineId },
					data: {
						approvedBillableMinutes: body.approvedMinutes,
						lineStatus: nextStatus,
						reviewerComment: body.reason,
						isLocked: body.lockLine && (nextStatus === "approved" || nextStatus === "adjusted_approved")
					}
				});
				await tx.reviewDecision.create({ data: {
					tenantId: body.tenantId,
					timesheetId: body.timesheetId,
					timesheetLineId: body.lineId,
					reviewerUserId: body.reviewerUserId,
					decisionType: body.decision,
					reason: body.reason,
					previousApprovedMinutes: prevLine.approvedBillableMinutes,
					newApprovedMinutes: body.approvedMinutes
				} });
				await tx.notification.create({ data: {
					tenantId: body.tenantId,
					recipientUserId: prevLine.timesheet.userId,
					notificationType: body.decision === "ask_clarification" ? "clarification_requested" : body.decision === "adjust_with_reason" ? "timesheet_adjusted" : "timesheet_approved",
					title: `Timesheet review: ${body.decision.replace("_", " ")}`,
					body: body.reason,
					targetEntity: "timesheet_lines",
					targetId: body.lineId
				} });
			});
			return sendJson(res, 200, { ok: true });
		}
		if (req.method === "POST" && url.startsWith("/api/prisma/invoices/lock")) {
			const body = await readJsonBody(req);
			if (!isValidUuid(body.invoiceId)) return sendJson(res, 200, { ok: false });
			await prisma.$transaction(async (tx) => {
				await tx.invoiceDraft.update({
					where: { id: body.invoiceId },
					data: {
						status: "finalized_locked",
						issuedAt: /* @__PURE__ */ new Date()
					}
				});
				for (const id of body.lineIds.filter(isValidUuid)) await tx.timesheetLine.update({
					where: { id },
					data: { isLocked: true }
				});
			});
			return sendJson(res, 200, { ok: true });
		}
		if (req.method === "PATCH" && url.startsWith("/api/prisma/notifications/read")) {
			const body = await readJsonBody(req);
			if (!isValidUuid(body.notificationId)) return sendJson(res, 200, { ok: false });
			await prisma.notification.update({
				where: { id: body.notificationId },
				data: { readAt: /* @__PURE__ */ new Date() }
			});
			return sendJson(res, 200, { ok: true });
		}
		if (req.method === "POST" && url.startsWith("/api/prisma/audit")) {
			const body = await readJsonBody(req);
			if (!isValidUuid(body.tenantId)) return sendJson(res, 200, { ok: false });
			await prisma.auditEntry.create({ data: {
				tenantId: body.tenantId,
				actorUserId: isValidUuid(body.actorUserId) ? body.actorUserId : null,
				actionType: body.actionType,
				targetEntity: body.targetEntity,
				reason: body.reason
			} });
			return sendJson(res, 201, { ok: true });
		}
		if (req.method === "POST" && url.startsWith("/api/prisma/phase2/webhook")) return sendJson(res, 202, await handleIngestWebhookPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase2/annotation")) return sendJson(res, 201, await handleCreateSessionAnnotationPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase2/exclusions")) return sendJson(res, 201, await handleAddPrivacyExclusionPrisma(await readJsonBody(req)));
		if (req.method === "DELETE" && url.startsWith("/api/prisma/phase2/exclusions")) return sendJson(res, 200, await handleRemovePrivacyExclusionPrisma(await readJsonBody(req)));
		if (req.method === "PATCH" && url.startsWith("/api/prisma/phase2/devices/revoke")) return sendJson(res, 200, await handleToggleDeviceRevocationPrisma(await readJsonBody(req)));
		if (req.method === "PATCH" && url.startsWith("/api/prisma/phase2/reconcile-gap")) return sendJson(res, 200, await handleReconcileGapPrisma(await readJsonBody(req)));
		if (req.method === "GET" && url.startsWith("/api/prisma/phase3/ai-status")) {
			const cfg = getGeminiConfig();
			return sendJson(res, 200, {
				configured: cfg.configured,
				model: cfg.model
			});
		}
		if (req.method === "POST" && url.startsWith("/api/prisma/phase3/ai-draft-gemini")) return sendJson(res, 200, await generateGeminiSummaryDraft(await readJsonBody(req)));
		if (req.method === "PATCH" && url.startsWith("/api/prisma/phase3/tenant-ai")) return sendJson(res, 200, await handleToggleTenantAiPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase3/rule-sets")) return sendJson(res, 201, await handlePublishRuleSetPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase3/ai-generate")) return sendJson(res, 201, await handleCreateAiGenerationPrisma(await readJsonBody(req)));
		if (req.method === "PATCH" && url.startsWith("/api/prisma/phase3/ai-decision")) return sendJson(res, 200, await handleDecideAiGenerationPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase3/timesheets/partial-approve")) return sendJson(res, 200, await handlePartialApproveTimesheetPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase3/disputes/action")) return sendJson(res, 200, await handleDisputeActionPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase3/disputes")) return sendJson(res, 201, await handleOpenDisputePrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase4/subscription/checkout")) return sendJson(res, 200, await handleCheckoutSubscriptionPrisma(await readJsonBody(req)));
		if (req.method === "PATCH" && url.startsWith("/api/prisma/phase4/branding")) return sendJson(res, 200, await handleUpdateBrandingPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase4/api-keys/revoke")) return sendJson(res, 200, await handleRevokeApiKeyPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase4/api-keys")) return sendJson(res, 201, await handleCreateApiKeyPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase4/webhooks/deliver")) return sendJson(res, 201, await handleDispatchWebhookDeliveryPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase4/webhooks")) return sendJson(res, 201, await handleCreateWebhookEndpointPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase4/connectors")) return sendJson(res, 200, await handleUpsertConnectorPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase4/calendar-sync")) return sendJson(res, 201, await handleSyncCalendarMeetingPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase4/portable-reports")) return sendJson(res, 201, await handleCreatePortableReportPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase5/sso")) return sendJson(res, 200, await handleUpsertSsoProviderPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase5/scim")) return sendJson(res, 201, await handleRecordScimEventPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase5/policy-changes/decide")) return sendJson(res, 200, await handleApprovePolicyChangeSecondPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase5/policy-changes")) return sendJson(res, 201, await handleProposePolicyChangePrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase5/legal-holds/release")) return sendJson(res, 200, await handleReleaseLegalHoldPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase5/legal-holds")) return sendJson(res, 201, await handleCreateLegalHoldPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase5/retention-policies")) return sendJson(res, 200, await handleUpsertRetentionPolicyPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase5/retention-jobs")) return sendJson(res, 201, await handleRecordRetentionJobPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase5/privacy-requests")) return sendJson(res, 201, await handleCreatePrivacyRequestPrisma(await readJsonBody(req)));
		if (req.method === "PATCH" && url.startsWith("/api/prisma/phase5/residency")) return sendJson(res, 200, await handleUpsertResidencyConfigPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase5/siem/export")) return sendJson(res, 201, await handleRecordSiemBatchPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase5/siem")) return sendJson(res, 201, await handleCreateSiemDestinationPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase5/fleet-releases")) return sendJson(res, 201, await handlePublishFleetReleasePrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase5/warehouse-exports")) return sendJson(res, 201, await handleCreateWarehouseExportPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase5/dr-exercises")) return sendJson(res, 201, await handleRecordDrExercisePrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/phase5/security-assessments")) return sendJson(res, 201, await handleUpsertSecurityAssessmentPrisma(await readJsonBody(req)));
		if (req.method === "PATCH" && url.startsWith("/api/prisma/phase5/accessibility")) return sendJson(res, 200, await handleUpdateAccessibilityConfigPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/rbac/seed")) return sendJson(res, 200, {
			ok: true,
			...await seedPermissionsAndRoles({ force: true })
		});
		if (req.method === "POST" && url.startsWith("/api/prisma/rbac/roles")) return sendJson(res, 201, await handleCreateCustomRolePrisma(await readJsonBody(req)));
		if (req.method === "PATCH" && url.startsWith("/api/prisma/rbac/roles")) return sendJson(res, 200, await handleUpdateCustomRolePrisma(await readJsonBody(req)));
		if (req.method === "DELETE" && url.startsWith("/api/prisma/rbac/roles")) return sendJson(res, 200, await handleDeleteCustomRolePrisma(await readJsonBody(req)));
		if (req.method === "PATCH" && url.startsWith("/api/prisma/rbac/member-role")) return sendJson(res, 200, await handleUpdateMemberRoleAndPermissionsPrisma(await readJsonBody(req)));
		if (req.method === "PUT" && url.startsWith("/api/prisma/rbac/tenant-owner-permissions")) return sendJson(res, 200, await handleUpdateTenantOwnerPermissionsPrisma(await readJsonBody(req)));
		if (req.method === "POST" && url.startsWith("/api/prisma/rbac/permissions")) return sendJson(res, 201, await handleRegisterPermissionPrisma(await readJsonBody(req)));
		sendJson(res, 404, { error: "Unknown Prisma API endpoint" });
		return true;
	} catch (err) {
		sendJson(res, 500, {
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		});
		return true;
	}
}
// src/server/vercelPrismaEntry.ts
function normalizeVercelRequestUrl(req) {
	const rawUrl = req.url ?? "";
	if (!rawUrl) return;
	const parsed = new URL(rawUrl, "http://localhost");
	const rewrittenPath = parsed.searchParams.get("__path");
	if (rewrittenPath !== null) {
		parsed.searchParams.delete("__path");
		const cleanSubpath = rewrittenPath.replace(/^\/+/, "");
		const remainingQuery = parsed.searchParams.toString();
		req.url = `/api/prisma/${cleanSubpath}${remainingQuery ? `?${remainingQuery}` : ""}`;
		return;
	}
	if (parsed.pathname === "/api/prisma") {
		const remainingQuery = parsed.searchParams.toString();
		req.url = `/api/prisma/${remainingQuery ? `?${remainingQuery}` : ""}`;
		return;
	}
	if (!parsed.pathname.startsWith("/api/prisma/")) {
		const cleanSubpath = parsed.pathname.replace(/^\/+/, "");
		const remainingQuery = parsed.searchParams.toString();
		req.url = `/api/prisma/${cleanSubpath}${remainingQuery ? `?${remainingQuery}` : ""}`;
	}
}
async function handler(req, res) {
	normalizeVercelRequestUrl(req);
	if (!await handlePrismaApiRequest(req, res)) {
		res.statusCode = 404;
		res.setHeader("Content-Type", "application/json");
		res.end(JSON.stringify({
			ok: false,
			error: `Not found: ${req.url ?? ""}`
		}));
	}
}
export { handler as default };
