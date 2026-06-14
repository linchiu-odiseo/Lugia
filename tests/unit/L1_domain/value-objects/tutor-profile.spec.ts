import { describe, it, expect } from 'vitest';
import {
  TutorProfile,
  TutorClassroom,
} from '../../../../src/L1_domain/value-objects/tutor-profile';

describe('TutorProfile', () => {
  const sampleClassroom1: TutorClassroom = {
    id: 'a957e020-14d6-41fb-af47-c52531d10b41',
    code: 'LIMA0001',
    name: 'Lima 01',
    modality: 'presencial',
    shift: 'manana',
    campusName: 'Lima Cercado',
    cycleId: 'e720709f-f499-4c77-974b-a4854bdd9632',
    cycleName: 'San Marcos - Semi Anual 0326',
    studentCount: 60,
  };

  const sampleClassroom2: TutorClassroom = {
    id: '5741e2db-a339-4466-99e5-1a4eb1d4339f',
    code: 'LIMA0002',
    name: 'Lima 02',
    modality: 'presencial',
    shift: 'manana',
    campusName: 'Lima San Juan De Lurigancho',
    cycleId: 'e720709f-f499-4c77-974b-a4854bdd9632',
    cycleName: 'San Marcos - Semi Anual 0326',
    studentCount: 60,
  };

  const sampleProfile: TutorProfile = {
    id: '19cabb89-c81d-4882-91be-3ab0e1414fae',
    code: 'T001',
    firstName: 'Carlos',
    lastName: 'Mendoza',
    email: 'tutor1@vonex.pe',
    classrooms: [sampleClassroom1, sampleClassroom2],
  };

  it('acepta shape completo con 2 aulas', () => {
    expect(sampleProfile.code).toBe('T001');
    expect(sampleProfile.classrooms).toHaveLength(2);
    expect(sampleProfile.classrooms[0].name).toBe('Lima 01');
  });

  it('acepta classrooms: [] (tutor sin aulas asignadas)', () => {
    const profileSinAulas: TutorProfile = {
      ...sampleProfile,
      classrooms: [],
    };
    expect(profileSinAulas.classrooms).toHaveLength(0);
  });

  it('permite sumar studentCount de las aulas', () => {
    const total = sampleProfile.classrooms.reduce((sum, c) => sum + c.studentCount, 0);
    expect(total).toBe(120);
  });

  it('expone code como código interno del tutor (no DNI)', () => {
    expect(sampleProfile.code).toBe('T001');
    // Distinto al DNI de un alumno
    expect(sampleProfile.code).not.toMatch(/^\d{8}$/);
  });
});
