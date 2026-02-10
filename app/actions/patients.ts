'use server'

import prisma from '@/lib/prisma';
import { uploadFileToS3, getSignedFileUrl } from '@/lib/s3';
import { Patient, AnalyticsData, PatientImage } from '@/types';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase-server';
import fs from 'fs';
import path from 'path';

async function checkAuth() {
    const supabase = createClient();
    // Using getUser() is more secure for server-side checks
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        throw new Error('Não autorizado');
    }
    return user;
}

export async function createPatient(formData: FormData) {
    await checkAuth();
    const id = formData.get('id') as string;
    const name = formData.get('name') as string;
    const cpf = formData.get('cpf') as string;
    const birthDateStr = formData.get('birthDate') as string;
    const birthDate = birthDateStr ? new Date(birthDateStr) : null;
    const examDate = new Date(formData.get('examDate') as string);
    const location = formData.get('location') as string;
    const technicianName = formData.get('technicianName') as string;
    const gender = formData.get('gender') as string;
    const ethnicity = formData.get('ethnicity') as string;
    const education = formData.get('education') as string;
    const occupation = formData.get('occupation') as string;
    const phone = formData.get('phone') as string;

    const underlyingDiseases = formData.get('underlyingDiseases') ? JSON.parse(formData.get('underlyingDiseases') as string) : undefined;
    const ophthalmicDiseases = formData.get('ophthalmicDiseases') ? JSON.parse(formData.get('ophthalmicDiseases') as string) : undefined;

    // 1. Primeiro, tenta encontrar ou criar o Patient (pessoa física)
    // Busca por nome + data nascimento ou cria novo
    let patient = await prisma.patient.findFirst({
        where: {
            name: name,
            ...(birthDate ? { birthDate: birthDate } : {}),
        }
    });

    if (!patient) {
        // Cria novo paciente
        patient = await prisma.patient.create({
            data: {
                id: id || `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name,
                cpf: cpf || null,
                birthDate,
                gender,
                ethnicity,
                education,
                occupation,
                phone,
                underlyingDiseases,
                ophthalmicDiseases,
                updatedAt: new Date(),
            },
        });
    } else {
        // Atualiza dados do paciente existente se necessário
        patient = await prisma.patient.update({
            where: { id: patient.id },
            data: {
                cpf: cpf || patient.cpf,
                gender: gender || patient.gender,
                ethnicity: ethnicity || patient.ethnicity,
                education: education || patient.education,
                occupation: occupation || patient.occupation,
                phone: phone || patient.phone,
                underlyingDiseases: underlyingDiseases || patient.underlyingDiseases,
                ophthalmicDiseases: ophthalmicDiseases || patient.ophthalmicDiseases,
                updatedAt: new Date(),
            }
        });
    }

    // 2. Cria o Exam (visita/exame)
    const exam = await prisma.exam.upsert({
        where: { id: id || 'new-exam-placeholder' },
        update: {
            examDate,
            location,
            technicianName,
            updatedAt: new Date(),
        },
        create: {
            id: id || `exam-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            examDate,
            location,
            technicianName,
            status: 'pending',
            patientId: patient.id,
            updatedAt: new Date(),
        },
    });

    const isAwsConfigured = process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_ACCESS_KEY_ID !== 'your-access-key-id' &&
        process.env.AWS_SECRET_ACCESS_KEY !== 'your-secret-access-key';

    const files = formData.getAll('images') as File[];
    const eyerUrls = formData.getAll('eyerUrls') as string[];

    // Handle images
    if (files.length > 0 && files[0].size > 0) {
        for (const file of files) {
            const buffer = Buffer.from(await file.arrayBuffer());
            const fileName = file.name;
            const contentType = file.type;

            let imageUrl = '';
            if (isAwsConfigured) {
                const s3Key = await uploadFileToS3(buffer, fileName, contentType);
                imageUrl = s3Key;
            } else {
                console.warn('[SERVER] AWS not configured, skipping S3 upload for local file');
                continue;
            }

            await prisma.examImage.create({
                data: {
                    id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    url: imageUrl,
                    fileName: fileName,
                    examId: exam.id,
                },
            });
        }
    } else if (eyerUrls.length > 0) {
        // For EyeR cloud/mock urls
        for (let i = 0; i < eyerUrls.length; i++) {
            const dataUrl = eyerUrls[i];

            if (dataUrl.startsWith('data:')) {
                // Handle Base64
                if (isAwsConfigured) {
                    const base64 = dataUrl.split(',')[1];
                    const buffer = Buffer.from(base64, 'base64');
                    const mimeMatch = dataUrl.match(/data:([^;]+);/);
                    const contentType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
                    const s3Key = await uploadFileToS3(buffer, `eyer-${i}.jpg`, contentType);

                    await prisma.examImage.create({
                        data: {
                            id: `img-b64-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            url: s3Key,
                            fileName: `eyer-image-${i + 1}.jpg`,
                            examId: exam.id,
                        },
                    });
                } else {
                    console.warn('[SERVER] AWS not configured, skipping S3 upload for base64 image');
                }
            } else if (dataUrl.startsWith('http')) {
                // Handle Cloud URL (Bytescale, etc)
                if (isAwsConfigured) {
                    try {
                        const response = await fetch(dataUrl);
                        if (response.ok) {
                            const arrayBuffer = await response.arrayBuffer();
                            const buffer = Buffer.from(arrayBuffer);
                            const contentType = response.headers.get('content-type') || 'image/jpeg';
                            const fileName = dataUrl.split('/').pop() || `cloud-image-${i}.jpg`;

                            const s3Key = await uploadFileToS3(buffer, fileName, contentType);

                            await prisma.examImage.create({
                                data: {
                                    id: `img-cl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                    url: s3Key,
                                    fileName: fileName,
                                    examId: exam.id,
                                },
                            });
                        } else {
                            throw new Error('Fetch failed');
                        }
                    } catch (fetchErr) {
                        console.error(`[SERVER] Failed to sync to S3, storing direct URL: ${dataUrl}`);
                        await prisma.examImage.create({
                            data: {
                                id: `img-dir-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                url: dataUrl,
                                fileName: dataUrl.split('/').pop() || `cloud-image-${i}.jpg`,
                                examId: exam.id,
                            },
                        });
                    }
                } else {
                    // AWS NOT CONFIGURED: Save the Bytescale URL directly
                    console.log(`[SERVER] AWS not configured, storing direct Bytescale URL: ${dataUrl}`);
                    await prisma.examImage.create({
                        data: {
                            id: `img-byte-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            url: dataUrl,
                            fileName: dataUrl.split('/').pop() || `cloud-image-${i}.jpg`,
                            examId: exam.id,
                        },
                    });
                }
            }
        }
    }

    revalidatePath('/');
    revalidatePath('/results');
    revalidatePath('/medical');
    revalidatePath('/referrals');
    revalidatePath('/analytics');

    return { success: true, id: exam.id, patientId: patient.id };
}

export async function getPatientsAction() {
    await checkAuth();

    // Busca todos os pacientes com seus exames
    const patients = await prisma.patient.findMany({
        include: {
            exams: {
                include: {
                    images: true,
                    report: true,
                    referral: true,
                },
                orderBy: { examDate: 'desc' },
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    const mappedPatients = await Promise.all(patients.map(async (p: any) => {
        try {
            // Mapeia cada exame do paciente
            const examsWithImages = await Promise.all(p.exams.map(async (exam: any) => {
                const imagesWithUrls = await Promise.all((exam.images || []).map(async (img: any) => ({
                    ...img,
                    data: await getSignedFileUrl(img.url),
                    uploadedAt: img.uploadedAt?.toISOString?.() || new Date(img.uploadedAt || Date.now()).toISOString(),
                })));

                return {
                    ...exam,
                    examDate: exam.examDate?.toISOString?.() || new Date(exam.examDate || Date.now()).toISOString(),
                    createdAt: exam.createdAt?.toISOString?.() || new Date(exam.createdAt || Date.now()).toISOString(),
                    images: imagesWithUrls,
                    report: exam.report ? {
                        ...exam.report,
                        diagnosticConditions: exam.report.diagnosticConditions as any,
                        completedAt: exam.report.completedAt?.toISOString?.() || new Date(exam.report.completedAt || Date.now()).toISOString(),
                    } : undefined,
                    referral: exam.referral ? {
                        ...exam.referral,
                        referralDate: exam.referral.referralDate?.toISOString?.() || new Date(exam.referral.referralDate || Date.now()).toISOString(),
                    } : undefined,
                };
            }));

            const latestExam = examsWithImages.length > 0 ? examsWithImages[0] : null;

            return {
                ...p,
                birthDate: p.birthDate?.toISOString?.() || (p.birthDate ? new Date(p.birthDate).toISOString() : null),
                createdAt: p.createdAt?.toISOString?.() || new Date(p.createdAt || Date.now()).toISOString(),
                exams: examsWithImages,
                // Retrocompatibilidade: promove dados do último exame para o nível do paciente
                status: latestExam?.status || 'pending',
                examDate: latestExam?.examDate || null,
                location: latestExam?.location || 'Não informado',
                technicianName: latestExam?.technicianName || '',
                images: latestExam?.images || [],
                // Imagens unificadas de todos os exames (sem duplicatas por URL)
                allImages: (() => {
                    const allImgs = examsWithImages.flatMap((exam: any) => exam.images || []);
                    const seenUrls = new Set<string>();
                    return allImgs.filter((img: any) => {
                        if (seenUrls.has(img.url)) return false;
                        seenUrls.add(img.url);
                        return true;
                    });
                })(),
                report: latestExam?.report || null,
                referral: latestExam?.referral || null,
            } as any;
        } catch (e) {
            console.error('Error mapping patient:', p.id, e);
            return {
                ...p,
                birthDate: p.birthDate ? String(p.birthDate) : '',
                createdAt: String(p.createdAt),
                exams: [],
                status: 'pending',
                images: [],
            } as any;
        }
    }));

    return mappedPatients;
}

// Atualiza um exame específico (por examId) - usado para laudos e encaminhamentos
export async function updateExamAction(examId: string, updates: any) {
    await checkAuth();

    // Handle report update
    if (updates.report) {
        await prisma.medicalReport.upsert({
            where: { examId: examId },
            update: {
                doctorName: updates.report.doctorName,
                doctorCRM: updates.report.doctorCRM,
                findings: updates.report.findings,
                diagnosis: updates.report.diagnosis,
                recommendations: updates.report.recommendations,
                suggestedConduct: updates.report.suggestedConduct,
                diagnosticConditions: updates.report.diagnosticConditions,
                selectedImages: updates.report.selectedImages,
                completedAt: new Date(updates.report.completedAt || undefined),
            },
            create: {
                id: `report-${examId}`,
                doctorName: updates.report.doctorName,
                doctorCRM: updates.report.doctorCRM,
                findings: updates.report.findings,
                diagnosis: updates.report.diagnosis,
                recommendations: updates.report.recommendations,
                suggestedConduct: updates.report.suggestedConduct,
                diagnosticConditions: updates.report.diagnosticConditions,
                selectedImages: updates.report.selectedImages,
                examId: examId,
                completedAt: new Date(updates.report.completedAt || undefined),
            }
        });
        delete updates.report;
    }

    // Handle referral update
    if (updates.referral) {
        await prisma.patientReferral.upsert({
            where: { examId: examId },
            update: {
                referredBy: updates.referral.referredBy,
                specialty: updates.referral.specialty,
                urgency: updates.referral.urgency,
                notes: updates.referral.notes,
                specializedService: updates.referral.specializedService,
                outcome: updates.referral.outcome,
                outcomeDate: updates.referral.outcomeDate ? new Date(updates.referral.outcomeDate) : undefined,
                scheduledDate: updates.referral.scheduledDate ? new Date(updates.referral.scheduledDate) : undefined,
                status: updates.referral.status,
            },
            create: {
                id: `ref-${examId}`,
                referredBy: updates.referral.referredBy,
                specialty: updates.referral.specialty,
                urgency: updates.referral.urgency,
                notes: updates.referral.notes,
                specializedService: updates.referral.specializedService,
                outcome: updates.referral.outcome,
                outcomeDate: updates.referral.outcomeDate ? new Date(updates.referral.outcomeDate) : undefined,
                scheduledDate: updates.referral.scheduledDate ? new Date(updates.referral.scheduledDate) : undefined,
                status: updates.referral.status,
                examId: examId,
            }
        });
        delete updates.referral;
    }

    // Update exam status if provided
    if (updates.status) {
        await prisma.exam.update({
            where: { id: examId },
            data: {
                status: updates.status,
                updatedAt: new Date(),
            },
        });
    }

    revalidatePath('/');
    revalidatePath('/results');
    revalidatePath('/medical');
    revalidatePath('/referrals');
    revalidatePath('/analytics');
}

// Mantém compatibilidade com código antigo - redireciona para updateExamAction
export async function updatePatientAction(id: string, updates: any) {
    await checkAuth();

    // Tenta ver se o ID é de um exame
    let exam = await prisma.exam.findUnique({ where: { id } });

    // Se não for, busca o exame mais recente desse paciente
    if (!exam) {
        exam = await prisma.exam.findFirst({
            where: { patientId: id },
            orderBy: { examDate: 'desc' }
        });
    }

    if (!exam) {
        // Fallback: se ainda assim não encontrar, talvez o ID seja um eyerCloudId que ainda não foi sincronizado perfeitamente como ID do banco
        exam = await prisma.exam.findFirst({
            where: { eyerCloudId: id },
            orderBy: { examDate: 'desc' }
        });
    }

    if (!exam) {
        throw new Error(`Exame não encontrado para o ID fornecido: ${id}`);
    }

    // Update Patient-level fields if provided
    const patientData: Record<string, any> = {};
    if (updates.cpf !== undefined) {
        patientData.cpf = updates.cpf;
        delete updates.cpf;
    }
    if (updates.phone !== undefined) {
        patientData.phone = updates.phone;
        delete updates.phone;
    }
    if (updates.underlyingDiseases !== undefined) {
        patientData.underlyingDiseases = updates.underlyingDiseases;
        delete updates.underlyingDiseases;
    }
    if (updates.ophthalmicDiseases !== undefined) {
        patientData.ophthalmicDiseases = updates.ophthalmicDiseases;
        delete updates.ophthalmicDiseases;
    }
    if (Object.keys(patientData).length > 0) {
        await prisma.patient.update({
            where: { id: exam.patientId },
            data: {
                ...patientData,
                updatedAt: new Date(),
            },
        });
    }

    return updateExamAction(exam.id, updates);
}

export async function getAnalyticsAction(): Promise<AnalyticsData> {
    await checkAuth();

    // Busca todos os exames com imagens e reports
    const exams = await prisma.exam.findMany({
        include: {
            images: true,
            report: true,
            patient: true,
        }
    });

    // Conta pacientes únicos
    const uniquePatientIds = new Set(exams.map((e: any) => e.patientId));

    const todayStr = new Date().toISOString().split('T')[0];

    const totalPatients = uniquePatientIds.size;
    const totalExams = exams.length;
    const totalImages = exams.reduce((sum: number, e: any) => sum + e.images.length, 0);
    const pendingReports = exams.filter((e: any) => e.status === 'pending').length;
    const completedReports = exams.filter((e: any) => e.status === 'completed').length;

    const examsToday = exams.filter((e: any) => e.createdAt.toISOString().split('T')[0] === todayStr).length;
    const imagesToday = exams
        .filter((e: any) => e.createdAt.toISOString().split('T')[0] === todayStr)
        .reduce((sum: number, e: any) => sum + e.images.length, 0);

    // Time calculation
    const completedExams = exams.filter((e: any) => e.status === 'completed' && e.report);
    const averageProcessingTime = completedExams.length > 0
        ? completedExams.reduce((sum: number, e: any) => {
            const created = e.createdAt.getTime();
            const completed = e.report!.completedAt.getTime();
            return sum + (completed - created) / (1000 * 60 * 60);
        }, 0) / completedExams.length
        : 0;

    // Productivity by region (location)
    const productivityByRegion = exams.reduce((acc: any, e: any) => {
        const region = e.location || 'Não Informado';
        acc[region] = (acc[region] || 0) + 1;
        return acc;
    }, {});

    // Productivity by professional (doctor who completed the report)
    const productivityByProfessional = exams.reduce((acc: any, e: any) => {
        if (e.status === 'completed' && e.report) {
            const doctor = e.report.doctorName;
            acc[doctor] = (acc[doctor] || 0) + 1;
        }
        return acc;
    }, {});

    return {
        totalPatients,
        totalExams,
        totalImages,
        pendingReports,
        completedReports,
        patientsToday: 0, // Seria necessário contar pacientes criados hoje
        examsToday,
        imagesToday,
        averageProcessingTime: Math.round(averageProcessingTime * 10) / 10,
        productivityByRegion,
        productivityByProfessional,
    } as any;
}

export async function getCloudMappingAction() {
    console.log('[SERVER] getCloudMappingAction called');
    try {
        const user = await checkAuth();
        console.log('[SERVER] Auth success for:', user.email);
    } catch (authError: any) {
        console.warn('[SERVER] Auth check failed:', authError.message);
    }

    try {
        const rootPath = process.cwd();
        // Extensive list of paths to try in production/Railway
        const pathsToTry = [
            path.join(rootPath, 'bytescale_mapping.json'),
            path.join(rootPath, 'public', 'bytescale_mapping.json'),
            path.join(rootPath, '.next', 'server', 'bytescale_mapping.json'),
            path.resolve('bytescale_mapping.json'),
            '/app/bytescale_mapping.json', // Docker/Railway default root
            path.join(rootPath, '..', 'bytescale_mapping.json')
        ];

        let foundPath: string | null = null;
        for (const p of pathsToTry) {
            try {
                if (fs.existsSync(p)) {
                    foundPath = p;
                    console.log('[SERVER] Found file at:', p);
                    break;
                }
            } catch (e) { }
        }

        if (!foundPath) {
            console.error('[SERVER] FILE NOT FOUND. Listing root directory for diagnosis...');
            try {
                const files = fs.readdirSync(rootPath);
                console.log('[SERVER] Files at Root:', files.join(', '));

                // One more crazy attempt: look for it recursively in common dirs
                const publicDir = path.join(rootPath, 'public');
                if (fs.existsSync(publicDir)) {
                    const pubFiles = fs.readdirSync(publicDir);
                    console.log('[SERVER] Files in Public:', pubFiles.join(', '));
                }
            } catch (e) { }
            return null;
        }
        console.log('[SERVER] Reading mapping from:', foundPath);
        const content = fs.readFileSync(foundPath, 'utf8');
        if (!content || content.trim() === '') {
            console.error('[SERVER] File is empty!');
            return null;
        }

        const data = JSON.parse(content);
        const entries = Object.entries(data);
        console.log('[SERVER] Success! Entries found:', entries.length);

        // Return a clean, shallow object to ensure perfect serialization
        const cleanData: any = {};
        entries.forEach(([key, val]) => {
            cleanData[key] = val;
        });

        return cleanData;
    } catch (error) {
        console.error('[SERVER] Fatal error in getCloudMappingAction:', error);
        return null;
    }
}
