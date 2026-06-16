import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpExamsApi } from '../../../../src/L3_periphery/http/http-exams-api';
import { SubmissionNotAvailableError } from '../../../../src/L1_domain/errors/submission-not-available.error';

// Cubre `HttpExamsApi.enviar()` durante el change `fase-3-exam-list-learnex`:
// el POST es un STUB sincrónico que lanza `SubmissionNotAvailableError` SIN
// hacer ninguna llamada HTTP. El contrato real (200, 409, errores 4xx) aterriza
// en Change 2 `fase-3-exam-submit-learnex`.
describe('HttpExamsApi.enviar (stub)', () => {
  let httpMock: HttpTestingController;
  let adapter: HttpExamsApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpExamsApi],
    });
    httpMock = TestBed.inject(HttpTestingController);
    adapter = TestBed.inject(HttpExamsApi);
  });

  // `verify()` en afterEach garantiza que ninguna request HTTP quedó pendiente
  // — confirmando que el stub no llamó al backend.
  afterEach(() => httpMock.verify());

  it('lanza SubmissionNotAvailableError SIN emitir request HTTP', async () => {
    await expect(
      adapter.enviar({
        examId: 'exam-1',
        answers: { '1': 'A', '2': 'B' },
        clientSubmittedAt: '2026-06-11T08:55:00.000Z',
      }),
    ).rejects.toBeInstanceOf(SubmissionNotAvailableError);

    // No matched any request — combinado con `httpMock.verify()` en afterEach
    // confirma que NO se hicieron requests.
    httpMock.expectNone(() => true);
  });
});
