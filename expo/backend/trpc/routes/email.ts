import * as z from "zod";
import { Resend } from "resend";
import { createTRPCRouter, publicProcedure } from "../create-context";

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail = process.env.RESEND_FROM_EMAIL || "Lyven <noreply@lyven.pt>";

export const emailRouter = createTRPCRouter({
  savePreferences: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        name: z.string(),
        preferences: z.record(z.string(), z.boolean()),
      })
    )
    .mutation(async ({ input }) => {
      console.log("[email.savePreferences] Saving preferences for:", input.email);
      return { success: true };
    }),

  sendNotification: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        name: z.string(),
        subject: z.string(),
        type: z.string(),
        content: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      console.log("[email.sendNotification] Sending to:", input.email, "type:", input.type);

      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: input.email,
        subject: input.subject,
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f0fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fafb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,153,168,0.10);">
          <tr>
            <td style="background:linear-gradient(135deg, #0099a8 0%, #007A87 100%);padding:36px 24px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:1px;">Lyven</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;font-weight:400;">${input.subject}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1a1a2e;">Ol\u00e1, ${input.name}!</p>
              <div style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                ${input.content}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 24px;text-align:center;border-top:1px solid #e6f6f7;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} Lyven. Todos os direitos reservados.</p>
              <p style="margin:8px 0 0;font-size:11px;color:#9ca3af;">Pode gerir as suas prefer\u00eancias de email nas defini\u00e7\u00f5es da app.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `.trim(),
      });

      if (error) {
        console.error("[email.sendNotification] Resend error:", error);
        throw new Error("Falha ao enviar email.");
      }

      console.log("[email.sendNotification] Email sent, id:", data?.id);
      return { success: true, emailId: data?.id };
    }),

  sendNewPromoterNotification: publicProcedure
    .input(
      z.object({
        promoterName: z.string(),
        promoterEmail: z.string().email(),
      })
    )
    .mutation(async ({ input }) => {
      console.log("[email.sendNewPromoterNotification] New promoter registered:", input.promoterEmail);

      const adminEmail = "info@lyven.pt";
      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: adminEmail,
        subject: "Novo Promotor Registado - Aguarda Aprovação",
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f0fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fafb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,153,168,0.10);">
          <tr>
            <td style="background:linear-gradient(135deg, #0099a8 0%, #007A87 100%);padding:36px 24px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:1px;">Lyven</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;font-weight:400;">Novo Promotor Registado</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1a1a2e;">Novo registo de promotor!</p>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                Um novo promotor registou-se na plataforma e aguarda a sua aprova\u00e7\u00e3o.
              </p>
              <div style="background-color:#f0fafb;border:1px solid #e6f6f7;border-radius:12px;padding:20px;margin:0 0 24px;">
                <p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Nome:</strong> ${input.promoterName}</p>
                <p style="margin:0;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Email:</strong> ${input.promoterEmail}</p>
              </div>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                Aceda ao painel de administra\u00e7\u00e3o para aprovar ou rejeitar este promotor.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 24px;text-align:center;border-top:1px solid #e6f6f7;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} Lyven. Todos os direitos reservados.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `.trim(),
      });

      if (error) {
        console.error("[email.sendNewPromoterNotification] Resend error:", error);
        throw new Error("Falha ao enviar email de notifica\u00e7\u00e3o ao admin.");
      }

      console.log("[email.sendNewPromoterNotification] Email sent to admin, id:", data?.id);
      return { success: true, emailId: data?.id };
    }),

  sendNewEventNotification: publicProcedure
    .input(
      z.object({
        eventTitle: z.string(),
        promoterName: z.string(),
        promoterEmail: z.string().email(),
        eventDate: z.string(),
        venueName: z.string(),
        category: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      console.log("[email.sendNewEventNotification] New event created:", input.eventTitle);

      const adminEmail = "info@lyven.pt";
      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: adminEmail,
        subject: "Novo Evento Criado - Aguarda Aprovação",
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f0fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fafb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,153,168,0.10);">
          <tr>
            <td style="background:linear-gradient(135deg, #0099a8 0%, #007A87 100%);padding:36px 24px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:1px;">Lyven</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;font-weight:400;">Novo Evento Aguarda Aprovação</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1a1a2e;">Novo evento submetido!</p>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                Um promotor submeteu um novo evento que aguarda a sua aprovação.
              </p>
              <div style="background-color:#f0fafb;border:1px solid #e6f6f7;border-radius:12px;padding:20px;margin:0 0 24px;">
                <p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Evento:</strong> ${input.eventTitle}</p>
                <p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Promotor:</strong> ${input.promoterName}</p>
                <p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Email:</strong> ${input.promoterEmail}</p>
                <p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Data:</strong> ${input.eventDate}</p>
                <p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Local:</strong> ${input.venueName}</p>
                <p style="margin:0;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Categoria:</strong> ${input.category}</p>
              </div>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                Aceda ao painel de administração para aprovar ou rejeitar este evento.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 24px;text-align:center;border-top:1px solid #e6f6f7;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} Lyven. Todos os direitos reservados.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `.trim(),
      });

      if (error) {
        console.error("[email.sendNewEventNotification] Resend error:", error);
        throw new Error("Falha ao enviar email de notificação ao admin.");
      }

      console.log("[email.sendNewEventNotification] Email sent to admin, id:", data?.id);
      return { success: true, emailId: data?.id };
    }),

  sendNewAdNotification: publicProcedure
    .input(
      z.object({
        adTitle: z.string(),
        promoterName: z.string(),
        adType: z.string(),
        budget: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      console.log("[email.sendNewAdNotification] New ad created:", input.adTitle);

      const adminEmail = "info@lyven.pt";
      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: adminEmail,
        subject: "Novo Anúncio Criado - Aguarda Aprovação",
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f0fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fafb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,153,168,0.10);">
          <tr>
            <td style="background:linear-gradient(135deg, #0099a8 0%, #007A87 100%);padding:36px 24px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:1px;">Lyven</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;font-weight:400;">Novo Anúncio Aguarda Aprovação</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1a1a2e;">Novo anúncio submetido!</p>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                Um promotor submeteu um novo anúncio que aguarda a sua aprovação.
              </p>
              <div style="background-color:#f0fafb;border:1px solid #e6f6f7;border-radius:12px;padding:20px;margin:0 0 24px;">
                <p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Anúncio:</strong> ${input.adTitle}</p>
                <p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Promotor:</strong> ${input.promoterName}</p>
                <p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Tipo:</strong> ${input.adType}</p>
                <p style="margin:0;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Orçamento:</strong> €${input.budget}</p>
              </div>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                Aceda ao painel de administração para aprovar ou rejeitar este anúncio.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 24px;text-align:center;border-top:1px solid #e6f6f7;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} Lyven. Todos os direitos reservados.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `.trim(),
      });

      if (error) {
        console.error("[email.sendNewAdNotification] Resend error:", error);
        throw new Error("Falha ao enviar email de notificação ao admin.");
      }

      console.log("[email.sendNewAdNotification] Email sent to admin, id:", data?.id);
      return { success: true, emailId: data?.id };
    }),

  sendPromoterApprovalEmail: publicProcedure
    .input(
      z.object({
        promoterName: z.string(),
        promoterEmail: z.string().email(),
      })
    )
    .mutation(async ({ input }) => {
      console.log("[email.sendPromoterApprovalEmail] Sending approval email to:", input.promoterEmail);

      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: input.promoterEmail,
        subject: "Conta Aprovada - Lyven",
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f0fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fafb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,153,168,0.10);">
          <tr>
            <td style="background:linear-gradient(135deg, #0099a8 0%, #007A87 100%);padding:36px 24px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:1px;">Lyven</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;font-weight:400;">Conta Aprovada</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1a1a2e;">Parab\u00e9ns, ${input.promoterName}!</p>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                A sua conta de promotor foi aprovada pela <strong style="color:#0099a8;">Lyven</strong>! \ud83c\udf89
              </p>
              <div style="background-color:#f0fafb;border:1px solid #e6f6f7;border-radius:12px;padding:20px;margin:0 0 24px;">
                <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#1a1a2e;">O que pode fazer agora:</p>
                <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">\u2705 Publicar eventos na plataforma</p>
                <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">\u2705 Gerir bilhetes e vendas</p>
                <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">\u2705 Acompanhar estat\u00edsticas</p>
                <p style="margin:0;font-size:14px;color:#6b7280;">\u2705 Interagir com seguidores</p>
              </div>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                Inicie sess\u00e3o na app Lyven como promotor para come\u00e7ar a criar os seus eventos.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 24px;text-align:center;border-top:1px solid #e6f6f7;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} Lyven. Todos os direitos reservados.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `.trim(),
      });

      if (error) {
        console.error("[email.sendPromoterApprovalEmail] Resend error:", error);
        throw new Error("Falha ao enviar email de aprova\u00e7\u00e3o.");
      }

      console.log("[email.sendPromoterApprovalEmail] Email sent, id:", data?.id);
      return { success: true, emailId: data?.id };
    }),

  sendVerificationCode: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        code: z.string().min(6).max(6),
        name: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      console.log("[email.sendVerificationCode] Sending code to:", input.email);

      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: input.email,
        subject: "Código de Verificação - Lyven",
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f0fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fafb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,153,168,0.10);">
          <tr>
            <td style="background:linear-gradient(135deg, #0099a8 0%, #007A87 100%);padding:36px 24px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:1px;">Lyven</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;font-weight:400;">Verificação de Email</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1a1a2e;">Olá, ${input.name}!</p>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                Usa o código abaixo para verificar o teu email e concluir o registo na Lyven.
              </p>
              <div style="background-color:#f0fafb;border:2px dashed #0099a8;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
                <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#007A87;">${input.code}</span>
              </div>
              <p style="margin:0 0 4px;font-size:13px;color:#9ca3af;text-align:center;">
                Este código expira em <strong style="color:#0099a8;">5 minutos</strong>.
              </p>
              <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">
                Se não solicitaste este código, podes ignorar este email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 24px;text-align:center;border-top:1px solid #e6f6f7;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} Lyven. Todos os direitos reservados.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `.trim(),
      });

      if (error) {
        console.error("[email.sendVerificationCode] Resend error:", error);
        throw new Error("Falha ao enviar email de verificação.");
      }

      console.log("[email.sendVerificationCode] Email sent successfully, id:", data?.id);
      return { success: true, emailId: data?.id };
    }),
});
