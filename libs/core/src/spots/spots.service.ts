import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateSpotDto } from './dto/create-spot.dto';
import { UpdateSpotDto } from './dto/update-spot.dto';
import { PrismaService } from '../prisma/prisma.service';
import { SpotStatus } from '@prisma/client';

@Injectable()
export class SpotsService {
  constructor(private prismaService: PrismaService) {}

  async create(createSpotDto: CreateSpotDto & { eventId: string }) {
    const event = await this.prismaService.event.findFirst({
      where: {
        id: createSpotDto.eventId,
      },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    //Verificação se já existe spot com o nome passado. Numa situação real,
    // eu confirmaria se eu poderia desenvolver esta regra, já que ela não foi solicitada.
    const spot = await this.prismaService.spot.findFirst({
      where: {
        AND: [
          { eventId: event.id },
          { name: createSpotDto.name }, // Adicionando a verificação do nome do spot
        ],
      },
    });

    if (spot) {
      throw new HttpException('Spot already exists', HttpStatus.BAD_REQUEST);
    }

    if (!createSpotDto.name) {
      throw new HttpException(
        'Name is required',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (typeof createSpotDto.name !== 'string') {
      throw new HttpException(
        'Name must be a string',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (createSpotDto.name.trim().length === 0) {
      throw new HttpException(
        'Name cannot be empty or just spaces',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (createSpotDto.name.length > 255) {
      throw new HttpException(
        'Name must be at most 255 characters',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return this.prismaService.spot.create({
      data: {
        ...createSpotDto,
        status: SpotStatus.available,
      },
    });
  }

  findAll(eventId: string) {
    return this.prismaService.spot.findMany({
      where: {
        eventId,
      },
    });
  }

  findOne(eventId: string, spotId: string) {
    return this.prismaService.spot.findFirst({
      where: {
        id: spotId,
        eventId,
      },
    });
  }

  update(eventId: string, spotId: string, updateSpotDto: UpdateSpotDto) {
    return this.prismaService.spot.update({
      where: {
        id: spotId,
        eventId,
      },
      data: updateSpotDto,
    });
  }

  remove(eventId: string, spotId: string) {
    return this.prismaService.spot.delete({
      where: {
        id: spotId,
        eventId,
      },
    });
  }
}
