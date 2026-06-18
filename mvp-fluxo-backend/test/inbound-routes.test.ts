import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  inboundTriggerRouteMatchesSource,
  isWhatsAppInboundSourceType,
} from "../src/inbound-channel-match";

describe("inbound-routes", () => {
  test("isWhatsAppInboundSourceType", () => {
    assert.equal(isWhatsAppInboundSourceType("twilio_whatsapp"), true);
    assert.equal(isWhatsAppInboundSourceType("whatsapp_meta"), true);
    assert.equal(isWhatsAppInboundSourceType("landing_page"), false);
  });

  test("inboundTriggerRouteMatchesSource com match_any_source_key entre Meta e Twilio", () => {
    const meta = { match_any_source_key: true };
    assert.equal(
      inboundTriggerRouteMatchesSource({
        routeSourceType: "twilio_whatsapp",
        routeSourceKey: "_trigger:site-clienton",
        routeMetadata: meta,
        inboundSourceType: "whatsapp_meta",
        inboundSourceKey: "meta:123456789",
      }),
      true
    );
    assert.equal(
      inboundTriggerRouteMatchesSource({
        routeSourceType: "twilio_whatsapp",
        routeSourceKey: "_trigger:site-clienton",
        routeMetadata: meta,
        inboundSourceType: "twilio_whatsapp",
        inboundSourceKey: "twilio:ACxxx:551150284949",
      }),
      true
    );
    assert.equal(
      inboundTriggerRouteMatchesSource({
        routeSourceType: "twilio_whatsapp",
        routeSourceKey: "_trigger:site-clienton",
        routeMetadata: meta,
        inboundSourceType: "landing_page",
        inboundSourceKey: "form:default",
      }),
      false
    );
  });

  test("inboundTriggerRouteMatchesSource sem match_any exige mesma chave ou telefone", () => {
    assert.equal(
      inboundTriggerRouteMatchesSource({
        routeSourceType: "twilio_whatsapp",
        routeSourceKey: "twilio:ACxxx:551150284949",
        routeMetadata: {},
        inboundSourceType: "twilio_whatsapp",
        inboundSourceKey: "twilio:ACxxx:551150284949",
      }),
      true
    );
    assert.equal(
      inboundTriggerRouteMatchesSource({
        routeSourceType: "twilio_whatsapp",
        routeSourceKey: "twilio:ACxxx:551150284949",
        routeMetadata: {},
        inboundSourceType: "whatsapp_meta",
        inboundSourceKey: "meta:123",
      }),
      false
    );
  });
});
