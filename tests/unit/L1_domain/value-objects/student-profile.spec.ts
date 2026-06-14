import { describe, it, expect } from 'vitest';
import { StudentProfile } from '../../../../src/L1_domain/value-objects/student-profile';

describe('StudentProfile', () => {
  const sampleProfile: StudentProfile = {
    id: '573e8dfa-faf4-4846-b05f-14143710515d',
    code: '79507732',
    firstName: 'Gabriel',
    lastName: 'Acuña Acuña',
    area: null,
  };

  it('acepta shape completo con todos los campos', () => {
    const profile: StudentProfile = {
      id: '573e8dfa-faf4-4846-b05f-14143710515d',
      code: '79507732',
      firstName: 'Gabriel',
      lastName: 'Acuña Acuña',
      area: 'Ciencias',
    };
    expect(profile.code).toBe('79507732');
    expect(profile.area).toBe('Ciencias');
  });

  it('acepta area: null (alumno sin examen rendido)', () => {
    expect(sampleProfile.area).toBeNull();
    expect(sampleProfile.code).toBe('79507732');
  });

  it('se puede crear por spread (value-object inmutable)', () => {
    const updated: StudentProfile = { ...sampleProfile, area: 'Letras' };
    expect(updated.area).toBe('Letras');
    // El original no se modifica
    expect(sampleProfile.area).toBeNull();
    expect(updated.firstName).toBe('Gabriel');
  });
});
