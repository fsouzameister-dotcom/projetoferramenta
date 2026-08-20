import type { FastifyPluginAsync } from "fastify";
import { ApiError, ERROR_CODES, sendSuccess } from "../http";
import {
  cancelAppointment,
  createAppointment,
  createAppointmentBlock,
  createAppointmentResource,
  createAppointmentService,
  deleteAppointmentBlock,
  deleteAppointmentResource,
  deleteAppointmentService,
  getAppointment,
  getAppointmentService,
  getAvailableSlots,
  listAppointmentBlocks,
  listAppointmentResources,
  listAppointmentServices,
  listAppointments,
  listAvailabilityRules,
  markAppointmentCompleted,
  replaceAvailabilityRules,
  rescheduleAppointment,
  updateAppointmentResource,
  updateAppointmentService,
  type AppointmentCapacityMode,
} from "../appointments";

function mapAppointmentError(err: unknown): never {
  const code = err instanceof Error ? err.message : "";
  if (code === "APPOINTMENT_SERVICE_NOT_FOUND") {
    throw new ApiError(404, ERROR_CODES.appointments.APPOINTMENT_SERVICE_NOT_FOUND, "Serviço de agendamento não encontrado");
  }
  if (code === "APPOINTMENT_RESOURCE_NOT_FOUND") {
    throw new ApiError(404, ERROR_CODES.appointments.APPOINTMENT_RESOURCE_NOT_FOUND, "Recurso não encontrado");
  }
  if (code === "APPOINTMENT_NOT_FOUND") {
    throw new ApiError(404, ERROR_CODES.appointments.APPOINTMENT_NOT_FOUND, "Agendamento não encontrado");
  }
  if (code === "APPOINTMENT_INVALID_STATUS") {
    throw new ApiError(409, ERROR_CODES.appointments.APPOINTMENT_INVALID_STATUS, "Status do agendamento não permite esta ação");
  }
  if (code === "APPOINTMENT_SLOT_TAKEN") {
    throw new ApiError(409, ERROR_CODES.appointments.APPOINTMENT_SLOT_TAKEN, "Este horário acabou de ser ocupado, escolha outro");
  }
  if (code === "APPOINTMENT_INVALID_DATE") {
    throw new ApiError(400, ERROR_CODES.appointments.APPOINTMENT_INVALID_DATE, "Data/hora inválida");
  }
  if (code === "APPOINTMENT_VALIDATION_ERROR") {
    throw new ApiError(400, ERROR_CODES.appointments.APPOINTMENT_VALIDATION_ERROR, "Dados inválidos para o agendamento");
  }
  throw err;
}

const appointmentRoutes: FastifyPluginAsync = async (fastify) => {
  // --- Serviços -------------------------------------------------------
  fastify.get("/admin/appointments/services", async (request, reply) => {
    const items = await listAppointmentServices(request.tenant.id);
    return sendSuccess(request, reply, items);
  });

  fastify.post("/admin/appointments/services", async (request, reply) => {
    const body = request.body as {
      name?: string;
      description?: string;
      durationMinutes?: number;
      capacityMode?: AppointmentCapacityMode;
      poolCapacity?: number;
      timezone?: string;
    };
    if (!body.name?.trim() || !body.durationMinutes) {
      throw new ApiError(400, ERROR_CODES.common.VALIDATION_ERROR, "Informe nome e duração do serviço");
    }
    try {
      const created = await createAppointmentService({
        tenantId: request.tenant.id,
        name: body.name,
        description: body.description,
        durationMinutes: body.durationMinutes,
        capacityMode: body.capacityMode === "resource" ? "resource" : "pool",
        poolCapacity: body.poolCapacity,
        timezone: body.timezone,
      });
      return sendSuccess(request, reply, created, 201);
    } catch (err) {
      mapAppointmentError(err);
    }
  });

  fastify.put("/admin/appointments/services/:serviceId", async (request, reply) => {
    const { serviceId } = request.params as { serviceId: string };
    const body = request.body as {
      name?: string;
      description?: string | null;
      durationMinutes?: number;
      capacityMode?: AppointmentCapacityMode;
      poolCapacity?: number;
      timezone?: string;
      active?: boolean;
    };
    try {
      const updated = await updateAppointmentService({ tenantId: request.tenant.id, serviceId, ...body });
      if (!updated) {
        throw new ApiError(404, ERROR_CODES.appointments.APPOINTMENT_SERVICE_NOT_FOUND, "Serviço não encontrado");
      }
      return sendSuccess(request, reply, updated);
    } catch (err) {
      mapAppointmentError(err);
    }
  });

  fastify.delete("/admin/appointments/services/:serviceId", async (request, reply) => {
    const { serviceId } = request.params as { serviceId: string };
    const removed = await deleteAppointmentService(request.tenant.id, serviceId);
    if (!removed) {
      throw new ApiError(404, ERROR_CODES.appointments.APPOINTMENT_SERVICE_NOT_FOUND, "Serviço não encontrado");
    }
    return sendSuccess(request, reply, { removed: true });
  });

  // --- Recursos ---------------------------------------------------------
  fastify.get("/admin/appointments/services/:serviceId/resources", async (request, reply) => {
    const { serviceId } = request.params as { serviceId: string };
    const items = await listAppointmentResources(request.tenant.id, serviceId);
    return sendSuccess(request, reply, items);
  });

  fastify.post("/admin/appointments/services/:serviceId/resources", async (request, reply) => {
    const { serviceId } = request.params as { serviceId: string };
    const body = request.body as { name?: string; active?: boolean };
    if (!body.name?.trim()) {
      throw new ApiError(400, ERROR_CODES.common.VALIDATION_ERROR, "Informe o nome do recurso");
    }
    try {
      const created = await createAppointmentResource({
        tenantId: request.tenant.id,
        serviceId,
        name: body.name,
        active: body.active,
      });
      return sendSuccess(request, reply, created, 201);
    } catch (err) {
      mapAppointmentError(err);
    }
  });

  fastify.put("/admin/appointments/resources/:resourceId", async (request, reply) => {
    const { resourceId } = request.params as { resourceId: string };
    const body = request.body as { name?: string; active?: boolean };
    try {
      const updated = await updateAppointmentResource({ tenantId: request.tenant.id, resourceId, ...body });
      if (!updated) {
        throw new ApiError(404, ERROR_CODES.appointments.APPOINTMENT_RESOURCE_NOT_FOUND, "Recurso não encontrado");
      }
      return sendSuccess(request, reply, updated);
    } catch (err) {
      mapAppointmentError(err);
    }
  });

  fastify.delete("/admin/appointments/resources/:resourceId", async (request, reply) => {
    const { resourceId } = request.params as { resourceId: string };
    const removed = await deleteAppointmentResource(request.tenant.id, resourceId);
    if (!removed) {
      throw new ApiError(404, ERROR_CODES.appointments.APPOINTMENT_RESOURCE_NOT_FOUND, "Recurso não encontrado");
    }
    return sendSuccess(request, reply, { removed: true });
  });

  // --- Expediente (regras de disponibilidade) ----------------------------
  fastify.get("/admin/appointments/services/:serviceId/availability-rules", async (request, reply) => {
    const { serviceId } = request.params as { serviceId: string };
    const items = await listAvailabilityRules(request.tenant.id, serviceId);
    return sendSuccess(request, reply, items);
  });

  fastify.put("/admin/appointments/services/:serviceId/availability-rules", async (request, reply) => {
    const { serviceId } = request.params as { serviceId: string };
    const body = request.body as {
      resourceId?: string | null;
      rules?: { weekday: number; startTime: string; endTime: string }[];
    };
    try {
      const updated = await replaceAvailabilityRules({
        tenantId: request.tenant.id,
        serviceId,
        resourceId: body.resourceId ?? null,
        rules: body.rules ?? [],
      });
      return sendSuccess(request, reply, updated);
    } catch (err) {
      mapAppointmentError(err);
    }
  });

  // --- Bloqueios ----------------------------------------------------------
  fastify.get("/admin/appointments/services/:serviceId/blocks", async (request, reply) => {
    const { serviceId } = request.params as { serviceId: string };
    const items = await listAppointmentBlocks(request.tenant.id, serviceId);
    return sendSuccess(request, reply, items);
  });

  fastify.post("/admin/appointments/services/:serviceId/blocks", async (request, reply) => {
    const { serviceId } = request.params as { serviceId: string };
    const body = request.body as { resourceId?: string | null; startsAt?: string; endsAt?: string; reason?: string };
    if (!body.startsAt || !body.endsAt) {
      throw new ApiError(400, ERROR_CODES.common.VALIDATION_ERROR, "Informe início e fim do bloqueio");
    }
    try {
      const created = await createAppointmentBlock({
        tenantId: request.tenant.id,
        serviceId,
        resourceId: body.resourceId,
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        reason: body.reason,
      });
      return sendSuccess(request, reply, created, 201);
    } catch (err) {
      mapAppointmentError(err);
    }
  });

  fastify.delete("/admin/appointments/blocks/:blockId", async (request, reply) => {
    const { blockId } = request.params as { blockId: string };
    const removed = await deleteAppointmentBlock(request.tenant.id, blockId);
    if (!removed) {
      throw new ApiError(404, ERROR_CODES.common.VALIDATION_ERROR, "Bloqueio não encontrado");
    }
    return sendSuccess(request, reply, { removed: true });
  });

  // --- Disponibilidade ------------------------------------------------
  fastify.get("/admin/appointments/services/:serviceId/available-slots", async (request, reply) => {
    const { serviceId } = request.params as { serviceId: string };
    const { date } = request.query as { date?: string };
    if (!date) {
      throw new ApiError(400, ERROR_CODES.common.VALIDATION_ERROR, "Informe a data (YYYY-MM-DD)");
    }
    try {
      const slots = await getAvailableSlots(request.tenant.id, serviceId, date);
      return sendSuccess(request, reply, slots);
    } catch (err) {
      mapAppointmentError(err);
    }
  });

  // --- Agendamentos -----------------------------------------------------
  fastify.get("/admin/appointments", async (request, reply) => {
    const query = request.query as {
      serviceId?: string;
      resourceId?: string;
      status?: string;
      from?: string;
      to?: string;
    };
    const items = await listAppointments(request.tenant.id, query);
    return sendSuccess(request, reply, items);
  });

  fastify.get("/admin/appointments/:appointmentId", async (request, reply) => {
    const { appointmentId } = request.params as { appointmentId: string };
    const item = await getAppointment(request.tenant.id, appointmentId);
    if (!item) {
      throw new ApiError(404, ERROR_CODES.appointments.APPOINTMENT_NOT_FOUND, "Agendamento não encontrado");
    }
    return sendSuccess(request, reply, item);
  });

  fastify.post("/admin/appointments", async (request, reply) => {
    const body = request.body as {
      serviceId?: string;
      resourceId?: string | null;
      scheduledStart?: string;
      clientName?: string;
      phoneE164?: string;
      metadata?: Record<string, unknown>;
    };
    if (!body.serviceId?.trim() || !body.scheduledStart?.trim()) {
      throw new ApiError(400, ERROR_CODES.common.VALIDATION_ERROR, "Informe o serviço e o horário desejado");
    }
    try {
      const created = await createAppointment({
        tenantId: request.tenant.id,
        serviceId: body.serviceId,
        resourceId: body.resourceId,
        scheduledStart: body.scheduledStart,
        clientName: body.clientName,
        phoneE164: body.phoneE164,
        metadata: body.metadata,
      });
      return sendSuccess(request, reply, created, 201);
    } catch (err) {
      mapAppointmentError(err);
    }
  });

  fastify.post("/admin/appointments/:appointmentId/reschedule", async (request, reply) => {
    const { appointmentId } = request.params as { appointmentId: string };
    const body = request.body as { scheduledStart?: string; resourceId?: string | null };
    if (!body.scheduledStart?.trim()) {
      throw new ApiError(400, ERROR_CODES.common.VALIDATION_ERROR, "Informe o novo horário");
    }
    try {
      const updated = await rescheduleAppointment({
        tenantId: request.tenant.id,
        appointmentId,
        scheduledStart: body.scheduledStart,
        resourceId: body.resourceId,
      });
      if (!updated) {
        throw new ApiError(404, ERROR_CODES.appointments.APPOINTMENT_NOT_FOUND, "Agendamento não encontrado");
      }
      return sendSuccess(request, reply, updated);
    } catch (err) {
      mapAppointmentError(err);
    }
  });

  fastify.post("/admin/appointments/:appointmentId/cancel", async (request, reply) => {
    const { appointmentId } = request.params as { appointmentId: string };
    try {
      const updated = await cancelAppointment(request.tenant.id, appointmentId);
      if (!updated) {
        throw new ApiError(404, ERROR_CODES.appointments.APPOINTMENT_NOT_FOUND, "Agendamento não encontrado");
      }
      return sendSuccess(request, reply, updated);
    } catch (err) {
      mapAppointmentError(err);
    }
  });

  fastify.post("/admin/appointments/:appointmentId/complete", async (request, reply) => {
    const { appointmentId } = request.params as { appointmentId: string };
    const body = request.body as { status?: "completed" | "no_show" };
    try {
      const updated = await markAppointmentCompleted(
        request.tenant.id,
        appointmentId,
        body.status === "no_show" ? "no_show" : "completed"
      );
      if (!updated) {
        throw new ApiError(404, ERROR_CODES.appointments.APPOINTMENT_NOT_FOUND, "Agendamento não encontrado");
      }
      return sendSuccess(request, reply, updated);
    } catch (err) {
      mapAppointmentError(err);
    }
  });
};

export default appointmentRoutes;
