import { Injectable, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { GetTutorExamsUseCase } from '../../L2_application/use-cases/get-tutor-exams.use-case';
import { GetTutorExamDetailUseCase } from '../../L2_application/use-cases/get-tutor-exam-detail.use-case';
import { ListClassroomStudentsUseCase } from '../../L2_application/use-cases/list-classroom-students.use-case';
import { IniciarExamenUseCase } from '../../L2_application/use-cases/iniciar-examen.use-case';
import { FinalizarExamenUseCase } from '../../L2_application/use-cases/finalizar-examen.use-case';
import { ActualizarAlumnosHabilitadosUseCase } from '../../L2_application/use-cases/actualizar-alumnos-habilitados.use-case';
import { TutorExamsStore } from '../state/tutor-exams.store';
import { TutorExamDetail } from '../../L1_domain/value-objects/tutor-exam-detail';
import { ClassroomStudent } from '../../L1_domain/value-objects/classroom-student';
import { TutorExam } from '../../L1_domain/entities/tutor-exam';
import { ExamServerStatus } from '../../L1_domain/value-objects/exam-server-status';
import { NetworkError } from '../../L1_domain/errors/network.error';
import { ExamConflictError } from '../../L1_domain/errors/exam-conflict.error';
import { ExamPreconditionError } from '../../L1_domain/errors/exam-precondition.error';
import { VirtualExamNotFoundError } from '../../L1_domain/errors/virtual-exam-not-found.error';
import { TutorExamForbiddenError } from '../../L1_domain/errors/tutor-exam-forbidden.error';

// View-model de la pantalla de gestión de un virtual exam (/tutor/exams/:recordId).
// Provider-local al TutorExamDetailPage (NO providedIn root) — cada montaje
// arranca limpio (D6 + D4). Ver diseño D1 (classroomId resolution), D2 (copy-by-action),
// D3 (online-only), D5 (UI guards), D8 (Strict TDD).
@Injectable()
export class TutorExamDetailViewModel {
  private readonly route = inject(ActivatedRoute);
  private readonly getTutorExams = inject(GetTutorExamsUseCase);
  private readonly getTutorExamDetail = inject(GetTutorExamDetailUseCase);
  private readonly listClassroomStudents = inject(ListClassroomStudentsUseCase);
  private readonly iniciarExamen = inject(IniciarExamenUseCase);
  private readonly finalizarExamen = inject(FinalizarExamenUseCase);
  private readonly actualizarAlumnos = inject(ActualizarAlumnosHabilitadosUseCase);
  private readonly store = inject(TutorExamsStore);

  // ── Signals expuestos (spec Requirement "TutorExamDetailViewModel — Signals expuestos") ──

  // Detalle del examen cargado desde el backend (null hasta primer carga exitosa).
  readonly detail = signal<TutorExamDetail | null>(null);

  // Lista de alumnos del aula del examen.
  readonly students = signal<readonly ClassroomStudent[]>([]);

  // true mientras la carga inicial esté en vuelo.
  readonly loading = signal(false);

  // Estado de error de carga: 'network' (NetworkError D3), 'notFound' (VirtualExamNotFoundError),
  // 'forbidden' (TutorExamForbiddenError), null si todo OK.
  readonly error = signal<'network' | 'notFound' | 'forbidden' | null>(null);

  // Set local mutable de IDs de alumnos habilitados. Se inicializa desde
  // detail().enabledStudentIds y se actualiza optimísticamente en toggleStudent().
  readonly enabledStudentIds = signal<readonly string[]>([]);

  // true mientras un PATCH/POST de acción está en vuelo.
  readonly isSaving = signal(false);

  // Copy en español del último error de acción (iniciar/finalizar/habilitar).
  // null si no hay error activo.
  readonly actionError = signal<string | null>(null);

  // ── Derived state helpers (para los guards de D5) ───────────────────────────

  // El botón "Iniciar" debe estar habilitado SOLO si status=scheduled Y hay ≥1 alumno
  // habilitado. (D5: defense-in-depth UI guard).
  canIniciar(): boolean {
    const d = this.detail();
    if (!d) return false;
    return d.status.is('scheduled') && this.enabledStudentIds().length > 0;
  }

  // El botón "Finalizar" debe estar habilitado SOLO si status=in_progress.
  canFinalizar(): boolean {
    const d = this.detail();
    if (!d) return false;
    return d.status.is('in_progress');
  }

  // Un checkbox de alumno está deshabilitado si el examen está finalizado (read-only)
  // o si el alumno ya entregó (hasSubmitted — backend 409 si se intenta cambiar).
  isCheckboxDisabled(student: ClassroomStudent): boolean {
    const d = this.detail();
    if (!d) return true;
    if (d.status.is('finalized')) return true;
    return student.hasSubmitted;
  }

  // ── Load sequence (D1) ──────────────────────────────────────────────────────

  // Carga completa: resolución de classroomId (D1) + detalle + alumnos en paralelo.
  // Es el punto de entrada principal del VM — la page lo llama en su constructor.
  async load(): Promise<void> {
    const recordId = this.route.snapshot.paramMap.get('recordId') ?? '';

    this.loading.set(true);
    this.error.set(null);

    try {
      // D1: Warm path — store ya tiene el exam → classroomId resuelto sin request extra.
      let exam = this.store.findByRecordId(recordId);

      if (!exam) {
        // D1: Cold path (deep-link / hard refresh) — store vacío → refetch lista una vez
        // para hidratar el store, luego re-resolver.
        const list = await this.getTutorExams.execute();
        this.store.setExams(list);
        exam = this.store.findByRecordId(recordId);
      }

      if (!exam) {
        // El recordId no existe en la lista del tutor — VirtualExamNotFoundError UX (D1).
        this.error.set('notFound');
        return;
      }

      const classroomId = exam.classroomId;
      const detailId = exam.detailId;

      // Cargar detalle + alumnos con los IDs ya resueltos.
      await this.loadDetailAndStudents(recordId, classroomId, detailId);
    } catch (err) {
      // Error durante el refetch de lista (D1 cold path).
      this.error.set(this.classifyLoadError(err));
    } finally {
      this.loading.set(false);
    }
  }

  // Reinvoca la secuencia completa de carga (D3: retry button).
  async retry(): Promise<void> {
    await this.load();
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  // Inicia el examen (scheduled → in_progress). Guard D5: solo si canIniciar().
  async iniciar(): Promise<void> {
    if (!this.canIniciar()) return;

    const recordId = this.route.snapshot.paramMap.get('recordId') ?? '';
    this.actionError.set(null);
    this.isSaving.set(true);

    try {
      await this.iniciarExamen.execute({ recordId });
      // Reload detail y upsert store (R4: list reflects new status immediately).
      await this.reloadDetail(recordId);
    } catch (err) {
      this.actionError.set(this.copyForAction('iniciar', err));
    } finally {
      this.isSaving.set(false);
    }
  }

  // Finaliza el examen (in_progress → finalized). Guard D5: solo si canFinalizar().
  // transitioned:false es idempotente — no es un error (spec Requirement "Finalizar idempotencia").
  async finalizar(): Promise<void> {
    if (!this.canFinalizar()) return;

    const recordId = this.route.snapshot.paramMap.get('recordId') ?? '';
    this.actionError.set(null);
    this.isSaving.set(true);

    try {
      await this.finalizarExamen.execute({ recordId });
      // Ambos transitioned:true y transitioned:false son éxito → reload + upsert (R4).
      await this.reloadDetail(recordId);
    } catch (err) {
      this.actionError.set(this.copyForAction('finalizar', err));
    } finally {
      this.isSaving.set(false);
    }
  }

  // Alterna el estado habilitado de un alumno.
  // Actualiza enabledStudentIds localmente (optimistic) y dispara el PATCH.
  // En error → revierte enabledStudentIds y setea actionError (D5 rollback).
  async toggleStudent(studentId: string): Promise<void> {
    const prev = this.enabledStudentIds();
    const recordId = this.route.snapshot.paramMap.get('recordId') ?? '';

    // Optimistic local update.
    const next = prev.includes(studentId)
      ? prev.filter((id) => id !== studentId)
      : [...prev, studentId];

    this.enabledStudentIds.set(next);
    this.actionError.set(null);
    this.isSaving.set(true);

    try {
      await this.actualizarAlumnos.execute({ recordId, enabledStudentIds: next });
    } catch (err) {
      // Rollback local state on error (spec Scenario "PATCH falla — enabledStudentIds se revierte").
      this.enabledStudentIds.set(prev);
      this.actionError.set(this.copyForAction('actualizarAlumnos', err));
    } finally {
      this.isSaving.set(false);
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  // Carga detalle + alumnos en paralelo una vez que classroomId y detailId están resueltos.
  private async loadDetailAndStudents(
    recordId: string,
    classroomId: string,
    detailId: string,
  ): Promise<void> {
    try {
      const [detail, students] = await Promise.all([
        this.getTutorExamDetail.execute({ recordId }),
        this.listClassroomStudents.execute({ classroomId, virtualExamDetailId: detailId }),
      ]);

      this.detail.set(detail);
      this.students.set(students);
      this.enabledStudentIds.set(detail.enabledStudentIds);
      this.error.set(null);
    } catch (err) {
      this.error.set(this.classifyLoadError(err));
    }
  }

  // Recarga el detalle tras una acción exitosa (iniciar/finalizar).
  // También llama store.upsert para que la lista refleje el nuevo estado (R4).
  private async reloadDetail(recordId: string): Promise<void> {
    const detail = await this.getTutorExamDetail.execute({ recordId });
    this.detail.set(detail);
    this.enabledStudentIds.set(detail.enabledStudentIds);

    // Upsert en el store con el nuevo status (R4 mitigation).
    // Construimos un TutorExam mínimo desde el detail — el classroomId lo
    // obtenemos del store (ya lo teníamos en el warm path o tras el refetch).
    const existingExam = this.store.findByRecordId(recordId);
    if (existingExam) {
      const updatedExam = new TutorExam({
        detailId: detail.id,
        recordId: detail.recordId,
        classroomId: existingExam.classroomId,
        entryId: existingExam.entryId,
        serverStatus: detail.status,
        name: detail.name,
        courseId: detail.courseId,
        count: detail.count,
        duration: detail.duration,
        startedAt: detail.startedAt,
        finishedAt: detail.finishedAt,
        createdAt: detail.createdAt,
      });
      this.store.upsert(updatedExam);
    }
  }

  // Clasifica errores de carga (initial load / retry) al error signal.
  private classifyLoadError(err: unknown): 'network' | 'notFound' | 'forbidden' {
    if (err instanceof NetworkError) return 'network';
    if (err instanceof VirtualExamNotFoundError) return 'notFound';
    if (err instanceof TutorExamForbiddenError) return 'forbidden';
    // Unexpected errors during load → treat as network for UX (log in future).
    return 'network';
  }

  // Copy-by-action table (D2): selecciona el mensaje en español según la
  // acción × tipo de error. Usa instanceof — NUNCA lee body.message (design.md D2).
  //
  // Tabla completa en design.md §D2. Los valores exactos respetan el tone rioplatense
  // del copy de diseño.
  private copyForAction(
    action: 'iniciar' | 'finalizar' | 'actualizarAlumnos',
    err: unknown,
  ): string {
    switch (action) {
      case 'iniciar':
        if (err instanceof ExamConflictError)
          return 'El examen ya cambió de estado. Actualizá la pantalla e intentá de nuevo.';
        if (err instanceof ExamPreconditionError)
          return 'No se puede iniciar: configurá las claves y habilitá al menos un alumno antes de iniciar el examen.';
        if (err instanceof VirtualExamNotFoundError)
          return 'Este examen ya no está disponible.';
        if (err instanceof TutorExamForbiddenError)
          return 'No tenés permiso para operar este examen.';
        if (err instanceof NetworkError)
          return 'Sin conexión. Revisá tu red y reintentá.';
        return 'Ocurrió un error al iniciar el examen. Reintentá.';

      case 'finalizar':
        if (err instanceof ExamConflictError)
          return 'El examen ya cambió de estado. Actualizá la pantalla e intentá de nuevo.';
        if (err instanceof ExamPreconditionError)
          return 'No se puede finalizar un examen que todavía no fue iniciado. Iniciálo primero.';
        if (err instanceof VirtualExamNotFoundError)
          return 'Este examen ya no está disponible.';
        if (err instanceof TutorExamForbiddenError)
          return 'No tenés permiso para operar este examen.';
        if (err instanceof NetworkError)
          return 'Sin conexión. Revisá tu red y reintentá.';
        return 'Ocurrió un error al finalizar el examen. Reintentá.';

      case 'actualizarAlumnos':
        if (err instanceof ExamConflictError)
          return 'No se pueden cambiar los alumnos: el set está congelado o un alumno ya entregó.';
        if (err instanceof ExamPreconditionError)
          return 'Configuración de alumnos inválida. Revisá la selección.';
        if (err instanceof VirtualExamNotFoundError)
          return 'Este examen ya no está disponible.';
        if (err instanceof TutorExamForbiddenError)
          return 'No tenés permiso para operar este examen.';
        if (err instanceof NetworkError)
          return 'Sin conexión. Revisá tu red y reintentá.';
        return 'Ocurrió un error al actualizar los alumnos. Reintentá.';
    }
  }
}

// Re-export ExamServerStatus for template usage (avoids extra imports in page).
export { ExamServerStatus };
