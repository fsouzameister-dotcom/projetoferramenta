import {
  formatMensagemBodyWithListFallback,
  formatMensagemBodyWithButtonFallback,
  type FlowOutboundMessage,
} from "./mensagem-outbound";
import {
  sendWhatsAppInteractiveListMessage,
  sendWhatsAppInteractiveReplyButtons,
  sendWhatsAppTextMessage,
} from "./whatsapp-cloud-api";
import { sendTwilioWhatsAppTextMessage } from "./whatsapp-twilio-api";

export type FlowWhatsAppSendContext =
  | {
      provider: "cloud";
      phoneNumberId: string;
      accessToken: string;
    }
  | {
      provider: "twilio";
      accountSid: string;
      authToken: string;
      fromE164: string;
    };

export async function deliverFlowOutboundToWhatsApp(input: {
  ctx: FlowWhatsAppSendContext;
  toDigits: string;
  outbound: FlowOutboundMessage;
}): Promise<{ ok: true; messageId: string } | { ok: false; message: string; code?: number }> {
  const { ctx, toDigits, outbound } = input;

  if (ctx.provider === "cloud") {
    if (outbound.kind === "interactive_list" && outbound.listItems?.length) {
      const result = await sendWhatsAppInteractiveListMessage({
        phoneNumberId: ctx.phoneNumberId,
        accessToken: ctx.accessToken,
        toDigits,
        bodyText: outbound.body,
        buttonText: outbound.listButtonText || "Ver opções",
        sectionTitle: outbound.listSectionTitle || "Opções",
        rows: outbound.listItems.map((item) => ({
          id: item.id,
          title: item.label,
          description: item.description,
        })),
      });
      if (!result.ok) {
        return { ok: false, message: result.message, code: result.code };
      }
      return { ok: true, messageId: result.messageId };
    }
    if (outbound.kind === "interactive_buttons" && outbound.buttons?.length) {
      const result = await sendWhatsAppInteractiveReplyButtons({
        phoneNumberId: ctx.phoneNumberId,
        accessToken: ctx.accessToken,
        toDigits,
        bodyText: outbound.body,
        buttons: outbound.buttons.map((b) => ({ id: b.id, title: b.label })),
      });
      if (!result.ok) {
        return { ok: false, message: result.message, code: result.code };
      }
      return { ok: true, messageId: result.messageId };
    }
    const result = await sendWhatsAppTextMessage({
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
      toDigits,
      textBody: outbound.body,
    });
    if (!result.ok) {
      return { ok: false, message: result.message, code: result.code };
    }
    return { ok: true, messageId: result.messageId };
  }

  const textBody =
    outbound.kind === "interactive_buttons" && outbound.buttons?.length
      ? formatMensagemBodyWithButtonFallback(outbound.body, outbound.buttons)
      : outbound.kind === "interactive_list" && outbound.listItems?.length
        ? formatMensagemBodyWithListFallback(outbound.body, outbound.listItems)
      : outbound.body;

  const result = await sendTwilioWhatsAppTextMessage({
    accountSid: ctx.accountSid,
    authToken: ctx.authToken,
    fromE164: ctx.fromE164,
    toDigits,
    textBody,
  });
  if (!result.ok) {
    return { ok: false, message: result.message, code: result.code };
  }
  return { ok: true, messageId: result.messageId };
}
