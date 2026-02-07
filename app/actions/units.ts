'use server'

import prisma from '@/lib/prisma';
import { HealthUnit } from '@/types';
import { revalidatePath } from 'next/cache';

export async function getHealthUnitsAction(): Promise<HealthUnit[]> {
    try {
        const units = await prisma.healthUnit.findMany({
            orderBy: { name: 'asc' },
        });

        return units.map(u => ({
            ...u,
            createdAt: u.createdAt.toISOString(),
            updatedAt: u.updatedAt.toISOString(),
        }));
    } catch (error) {
        console.error('Error fetching health units:', error);
        return [];
    }
}

export async function createHealthUnitAction(data: Omit<HealthUnit, 'id' | 'createdAt' | 'updatedAt'>) {
    try {
        const unit = await prisma.healthUnit.create({
            data: {
                ...data,
                id: Math.random().toString(36).substr(2, 9),
                updatedAt: new Date(),
            },
        });

        revalidatePath('/units');
        return { success: true, id: unit.id };
    } catch (error) {
        console.error('Error creating health unit:', error);
        return { success: false, error: 'Erro ao criar unidade.' };
    }
}

export async function updateHealthUnitAction(id: string, data: Partial<Omit<HealthUnit, 'id' | 'createdAt' | 'updatedAt'>>) {
    try {
        await prisma.healthUnit.update({
            where: { id },
            data: {
                ...data,
                updatedAt: new Date(),
            },
        });

        revalidatePath('/units');
        return { success: true };
    } catch (error) {
        console.error('Error updating health unit:', error);
        return { success: false, error: 'Erro ao atualizar unidade.' };
    }
}

export async function deleteHealthUnitAction(id: string) {
    try {
        await prisma.healthUnit.delete({
            where: { id },
        });

        revalidatePath('/units');
        return { success: true };
    } catch (error) {
        console.error('Error deleting health unit:', error);
        return { success: false, error: 'Erro ao excluir unidade.' };
    }
}
