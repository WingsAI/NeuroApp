"use strict";

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seedTauaUnit() {
    try {
        // Check if unit already exists
        const existing = await prisma.healthUnit.findFirst({
            where: {
                name: {
                    contains: 'Tauá',
                },
            },
        });

        if (existing) {
            console.log('✅ Unidade Tauá - Ceará já existe:', existing.id);
            return;
        }

        // Create the unit
        const unit = await prisma.healthUnit.create({
            data: {
                name: 'Tauá - Ceará',
                address: 'Centro, Tauá - CE, 63660-000',
                email: 'saude@taua.ce.gov.br',
                phone: '(88) 3437-1500',
                responsible: 'Secretaria Municipal de Saúde',
            },
        });

        console.log('✅ Unidade Tauá - Ceará criada com sucesso!');
        console.log('   ID:', unit.id);
        console.log('   Nome:', unit.name);
    } catch (error) {
        console.error('❌ Erro ao criar unidade:', error);
    } finally {
        await prisma.$disconnect();
    }
}

seedTauaUnit();
