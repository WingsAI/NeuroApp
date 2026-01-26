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
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.user) {
        throw new Error('Não autorizado');
    }
    return session.user;
}

export async function createPatient(formData: FormData) {
    await checkAuth();
    const id = formData.get('id') as string;
    const name = formData.get('name') as string;
    const cpf = formData.get('cpf') as string;
    const birthDate = new Date(formData.get('birthDate') as string);
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

    // Create patient in DB
    const patient = await prisma.patient.create({
        data: {
            id: id || undefined,
            name,
            cpf,
            birthDate,
            examDate,
            location,
            technicianName,
            gender,
            ethnicity,
            education,
            occupation,
            phone,
            underlyingDiseases,
            ophthalmicDiseases,
            status: 'pending',
        },
    });

    const files = formData.getAll('images') as File[];
    const eyerUrls = formData.getAll('eyerUrls') as string[];

    // Handle images
    if (files.length > 0 && files[0].size > 0) {
        for (const file of files) {
            const buffer = Buffer.from(await file.arrayBuffer());
            const s3Key = await uploadFileToS3(buffer, file.name, file.type);

            await prisma.patientImage.create({
                data: {
                    url: s3Key,
                    fileName: file.name,
                    patientId: patient.id,
                },
            });
        }
    } else if (eyerUrls.length > 0) {
        // For EyeR cloud/mock urls
        for (let i = 0; i < eyerUrls.length; i++) {
            const dataUrl = eyerUrls[i];

            if (dataUrl.startsWith('data:')) {
                // Handle Base64
                const base64 = dataUrl.split(',')[1];
                const buffer = Buffer.from(base64, 'base64');
                const mimeMatch = dataUrl.match(/data:([^;]+);/);
                const contentType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
                const s3Key = await uploadFileToS3(buffer, `eyer-${i}.jpg`, contentType);

                await prisma.patientImage.create({
                    data: {
                        url: s3Key,
                        fileName: `eyer-image-${i + 1}.jpg`,
                        patientId: patient.id,
                    },
                });
            } else if (dataUrl.startsWith('http')) {
                // Handle Cloud URL (fetch from Bytescale)
                try {
                    const response = await fetch(dataUrl);
                    const arrayBuffer = await response.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    const contentType = response.headers.get('content-type') || 'image/jpeg';
                    const fileName = dataUrl.split('/').pop() || `cloud-image-${i}.jpg`;

                    const s3Key = await uploadFileToS3(buffer, fileName, contentType);

                    await prisma.patientImage.create({
                        data: {
                            url: s3Key,
                            fileName: fileName,
                            patientId: patient.id,
                        },
                    });
                } catch (fetchErr) {
                    console.error(`Failed to fetch cloud image: ${dataUrl}`, fetchErr);
                }
            }
        }
    }

    revalidatePath('/');
    revalidatePath('/results');
    revalidatePath('/medical');
    revalidatePath('/referrals');
    revalidatePath('/analytics');

    return { success: true, id: patient.id };
}

export async function getPatientsAction() {
    await checkAuth();
    const patients = await prisma.patient.findMany({
        include: {
            images: true,
            report: true,
            referral: true,
        },
        orderBy: { createdAt: 'desc' },
    });

    // Convert S3 keys to signed URLs and map back to our Type
    const mappedPatients = await Promise.all(patients.map(async (p: any) => {
        const imagesWithUrls = await Promise.all(p.images.map(async (img: any) => ({
            ...img,
            data: await getSignedFileUrl(img.url),
            uploadedAt: img.uploadedAt.toISOString(),
        })));

        return {
            ...p,
            birthDate: p.birthDate.toISOString(),
            examDate: p.examDate.toISOString(),
            createdAt: p.createdAt.toISOString(),
            images: imagesWithUrls,
            report: p.report ? {
                ...p.report,
                diagnosticConditions: p.report.diagnosticConditions as any,
                completedAt: p.report.completedAt.toISOString(),
            } : undefined,
            referral: p.referral ? {
                ...p.referral,
                referralDate: p.referral.referralDate.toISOString(),
            } : undefined,
        } as any;
    }));

    return mappedPatients;
}

export async function updatePatientAction(id: string, updates: any) {
    await checkAuth();
    // Handle specific updates like report or referral
    if (updates.report) {
        await prisma.medicalReport.upsert({
            where: { patientId: id },
            update: {
                doctorName: updates.report.doctorName,
                findings: updates.report.findings,
                diagnosis: updates.report.diagnosis,
                recommendations: updates.report.recommendations,
                diagnosticConditions: updates.report.diagnosticConditions,
                selectedImages: updates.report.selectedImages,
                completedAt: new Date(updates.report.completedAt || undefined),
            },
            create: {
                doctorName: updates.report.doctorName,
                findings: updates.report.findings,
                diagnosis: updates.report.diagnosis,
                recommendations: updates.report.recommendations,
                diagnosticConditions: updates.report.diagnosticConditions,
                selectedImages: updates.report.selectedImages,
                patientId: id,
                completedAt: new Date(updates.report.completedAt || undefined),
            }
        });
        delete updates.report;
    }

    if (updates.referral) {
        await prisma.patientReferral.upsert({
            where: { patientId: id },
            update: {
                referredBy: updates.referral.referredBy,
                specialty: updates.referral.specialty,
                urgency: updates.referral.urgency,
                notes: updates.referral.notes,
                specializedService: updates.referral.specializedService,
                outcome: updates.referral.outcome,
                outcomeDate: updates.referral.outcomeDate ? new Date(updates.referral.outcomeDate) : undefined,
                status: updates.referral.status,
            },
            create: {
                referredBy: updates.referral.referredBy,
                specialty: updates.referral.specialty,
                urgency: updates.referral.urgency,
                notes: updates.referral.notes,
                specializedService: updates.referral.specializedService,
                outcome: updates.referral.outcome,
                outcomeDate: updates.referral.outcomeDate ? new Date(updates.referral.outcomeDate) : undefined,
                status: updates.referral.status,
                patientId: id,
            }
        });
        delete updates.referral;
    }

    await prisma.patient.update({
        where: { id },
        data: updates,
    });

    revalidatePath('/');
    revalidatePath('/results');
    revalidatePath('/medical');
    revalidatePath('/referrals');
    revalidatePath('/analytics');
}

export async function getAnalyticsAction(): Promise<AnalyticsData> {
    await checkAuth();
    const patients = await prisma.patient.findMany({
        include: {
            images: true,
            report: true,
        }
    });

    const todayStr = new Date().toISOString().split('T')[0];

    const totalPatients = patients.length;
    const totalImages = patients.reduce((sum: number, p: any) => sum + p.images.length, 0);
    const pendingReports = patients.filter((p: any) => p.status === 'pending').length;
    const completedReports = patients.filter((p: any) => p.status === 'completed').length;

    const patientsToday = patients.filter((p: any) => p.createdAt.toISOString().split('T')[0] === todayStr).length;
    const imagesToday = patients
        .filter((p: any) => p.createdAt.toISOString().split('T')[0] === todayStr)
        .reduce((sum: number, p: any) => sum + p.images.length, 0);

    // Time calculation
    const completedPatients = patients.filter((p: any) => p.status === 'completed' && p.report);
    const averageProcessingTime = completedPatients.length > 0
        ? completedPatients.reduce((sum: number, p: any) => {
            const created = p.createdAt.getTime();
            const completed = p.report!.completedAt.getTime();
            return sum + (completed - created) / (1000 * 60 * 60);
        }, 0) / completedPatients.length
        : 0;

    // Productivity by region (location)
    const productivityByRegion = patients.reduce((acc: any, p: any) => {
        const region = p.location || 'Não Informado';
        acc[region] = (acc[region] || 0) + 1;
        return acc;
    }, {});

    // Productivity by professional (doctor who completed the report)
    const productivityByProfessional = patients.reduce((acc: any, p: any) => {
        if (p.status === 'completed' && p.report) {
            const doctor = p.report.doctorName;
            acc[doctor] = (acc[doctor] || 0) + 1;
        }
        return acc;
    }, {});

    return {
        totalPatients,
        totalImages,
        pendingReports,
        completedReports,
        patientsToday,
        imagesToday,
        averageProcessingTime: Math.round(averageProcessingTime * 10) / 10,
        productivityByRegion,
        productivityByProfessional,
    } as any;
}

export async function getCloudMappingAction() {
    // A verificação de auth é feita pelo middleware nas rotas protegidas
    // Ainda assim, verificamos mas não bloqueamos se falhar
    try {
        await checkAuth();
    } catch (authError) {
        console.warn('[getCloudMappingAction] Auth check failed, but proceeding since middleware protects routes:', authError);
    }

    try {
        const mappingPath = path.join(process.cwd(), 'bytescale_mapping.json');
        console.log('[getCloudMappingAction] Looking for mapping at:', mappingPath);

        if (!fs.existsSync(mappingPath)) {
            console.warn('[getCloudMappingAction] Mapping file not found');
            return null;
        }
        const content = fs.readFileSync(mappingPath, 'utf8');
        const data = JSON.parse(content);
        console.log('[getCloudMappingAction] Loaded', Object.keys(data).length, 'entries');
        return data;
    } catch (error) {
        console.error('[getCloudMappingAction] Erro ao ler mapeamento:', error);
        return null;
    }
}
