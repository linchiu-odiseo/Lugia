import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  EnvioRequest,
  EnvioResult,
  ExamsApi,
  ExamsListResult,
} from '../../L1_domain/ports/exams-api';
import { Exam } from '../../L1_domain/entities/exam';
import { ExamServerStatus } from '../../L1_domain/value-objects/exam-server-status';
import { ServerTime } from '../../L1_domain/value-objects/server-time';
import { InvalidExamError } from '../../L1_domain/errors/invalid-exam.error';
import { NetworkError } from '../../L1_domain/errors/network.error';
import { ExamsPermissionRevokedError } from '../../L1_domain/errors/exams-permission-revoked.error';
import { StudentNotLinkedError } from '../../L1_domain/errors/student-not-linked.error';
import { SubmissionNotAvailableError } from '../../L1_domain/errors/submission-not-available.error';
import { apiPath } from './api-paths';

interface ExamDto {
  id: string;
  area: string | null;
  course: string | null;
  type: string;
  name: string;
  count: number;
  duration: number;
  status: 'scheduled' | 'in_progress' | 'finalized';
  scheduled: string;
  started: string | null;
  finished: string | null;
}

interface ExamsListResponseDto {
  serverTime: string;
  exams: ExamDto[];
}

@Injectable({ providedIn: 'root' })
export class HttpExamsApi implements ExamsApi {
  private readonly http = inject(HttpClient);

  async getTodaysExams(): Promise<ExamsListResult> {
    try {
      const dto = await firstValueFrom(
        this.http.get<ExamsListResponseDto>(apiPath.studentExamSessions()),
      );
      // Pasa el DTO al dominio sin filtrar: los casos `in_progress` con
      // `started === null` (data rara que el back en teoría nunca emite)
      // se aceptan igual. La PWA es resiliente — el view-model los muestra
      // como entrables con banner "tomando un café" + botón Enviar disabled,
      // exactamente como cuando `started` cae en el futuro. La puerta
      // sigue siendo `serverStatus`; la vigencia la decide `hasStartedBy(now)`.
      return {
        exams: dto.exams.map((e) => this.toExam(e)),
        serverTime: new ServerTime(dto.serverTime),
      };
    } catch (err) {
      throw this.classifyListError(err);
    }
  }

  // POST stub durante `fase-3-exam-list-learnex`. Reemplazado por el
  // contrato real (dos timestamps, idempotencia, errores específicos)
  // en `fase-3-exam-submit-learnex`. NO hace llamada HTTP.
  // SubmissionNotAvailableError NO extiende NetworkError, así que el use
  // case `EnviarSimulacroUseCase` lo propaga sin encolar en el outbox.
  async enviar(_req: EnvioRequest): Promise<EnvioResult> {
    throw new SubmissionNotAvailableError();
  }

  private toExam(dto: ExamDto): Exam {
    const scheduled = new Date(dto.scheduled);
    if (Number.isNaN(scheduled.getTime())) {
      throw new InvalidExamError(`Exam scheduled no es ISO8601 válido: "${dto.scheduled}".`);
    }
    const started = dto.started !== null ? new Date(dto.started) : null;
    if (started !== null && Number.isNaN(started.getTime())) {
      throw new InvalidExamError(`Exam started no es ISO8601 válido: "${dto.started}".`);
    }
    const finished = dto.finished !== null ? new Date(dto.finished) : null;
    if (finished !== null && Number.isNaN(finished.getTime())) {
      throw new InvalidExamError(`Exam finished no es ISO8601 válido: "${dto.finished}".`);
    }
    return new Exam({
      id: dto.id,
      area: dto.area,
      course: dto.course,
      type: dto.type,
      name: dto.name,
      count: dto.count,
      duration: dto.duration,
      serverStatus: new ExamServerStatus(dto.status),
      scheduled,
      started,
      finished,
    });
  }

  // Clasificación por (status, endpoint, body.code) — NUNCA por message.
  // 401 lo absorbe el credentials.interceptor (refresh + redirect login).
  private classifyListError(err: unknown): Error {
    if (err instanceof InvalidExamError) return err;
    if (err instanceof HttpErrorResponse) {
      if (err.status === 403) return new ExamsPermissionRevokedError();
      if (err.status === 404) {
        const body = (err.error ?? {}) as { code?: string };
        if (body.code === 'STUDENT_NOT_LINKED') return new StudentNotLinkedError();
        return new NetworkError();
      }
      if (err.status === 0 || err.status === 429 || err.status >= 500) {
        return new NetworkError();
      }
    }
    return new NetworkError();
  }
}
