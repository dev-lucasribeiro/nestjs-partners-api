import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ReserveSpotDto } from './dto/reserve-spot.dto';
import { Prisma, SpotStatus, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isValid, parseISO } from 'date-fns';

@Injectable()
export class EventsService {
  constructor(private prismaService: PrismaService) {}

  create(createEventDto: CreateEventDto) {
    if (!createEventDto.name) {
      throw new HttpException(
        'Name is required',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (typeof createEventDto.name !== 'string') {
      throw new HttpException(
        'Name must be a string',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (createEventDto.name.trim().length === 0) {
      throw new HttpException(
        'Name cannot be empty or just spaces',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (createEventDto.name.length > 255) {
      throw new HttpException(
        'Name must be at most 255 characters',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (!createEventDto.description) {
      throw new HttpException(
        'Description is required',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (typeof createEventDto.description !== 'string') {
      throw new HttpException(
        'Description must be a string',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (createEventDto.description.trim().length === 0) {
      throw new HttpException(
        'Description cannot be empty or just spaces',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (createEventDto.description.length > 255) {
      throw new HttpException(
        'Description must be at most 255 characters',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const parsedDate = parseISO(createEventDto.date);
    if (!createEventDto.date) {
      throw new HttpException(
        'Date is required',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (!isValid(parsedDate)) {
      throw new HttpException(
        'Date must be a valid ISO8601 date',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (createEventDto.price === undefined) {
      throw new HttpException(
        'Price is required',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (typeof createEventDto.price !== 'number') {
      throw new HttpException(
        'Price must be a number',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (createEventDto.price < 0) {
      throw new HttpException(
        'Price must be a non-negative number',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return this.prismaService.event.create({
      data: {
        ...createEventDto,
        date: new Date(createEventDto.date),
      },
    });
  }

  findAll() {
    return this.prismaService.event.findMany();
  }

  findOne(id: string) {
    return this.prismaService.event.findUnique({
      where: { id },
    });
  }

  update(id: string, updateEventDto: UpdateEventDto) {
    return this.prismaService.event.update({
      data: {
        ...updateEventDto,
        date: new Date(updateEventDto.date),
      },
      where: { id },
    });
  }

  remove(id: string) {
    return this.prismaService.event.delete({
      where: { id },
    });
  }

  async reserveSpot(dto: ReserveSpotDto & { eventId: string }) {
    if (!Array.isArray(dto.spots)) {
      throw new HttpException(
        'Spots must be an array',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (dto.spots.some((spot) => typeof spot !== 'string')) {
      throw new HttpException(
        'All spots must be strings',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (!(dto.ticket_kind == 'full' || dto.ticket_kind == 'half')) {
      throw new HttpException(
        'Ticket kind must be full or half',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const spots = await this.prismaService.spot.findMany({
      where: {
        eventId: dto.eventId,
        name: {
          in: dto.spots,
        },
      },
    });
    if (spots.length !== dto.spots.length) {
      const foundSpotsName = spots.map((spot) => spot.name);
      const notFoundSpotsName = dto.spots.filter(
        (spotName) => !foundSpotsName.includes(spotName),
      );
      throw new Error(`Spots ${notFoundSpotsName.join(', ')} not found`);
    }

    try {
      const tickets = await this.prismaService.$transaction(
        async (prisma) => {
          await prisma.reservationHistory.createMany({
            data: spots.map((spot) => ({
              spotId: spot.id,
              ticketKind: dto.ticket_kind,
              email: dto.email,
              status: TicketStatus.reserved,
            })),
          });

          await prisma.spot.updateMany({
            where: {
              id: {
                in: spots.map((spot) => spot.id),
              },
            },
            data: {
              status: SpotStatus.reserved,
            },
          });

          const tickets = await Promise.all(
            spots.map((spot) =>
              prisma.ticket.create({
                data: {
                  spotId: spot.id,
                  ticketKind: dto.ticket_kind,
                  email: dto.email,
                },
              }),
            ),
          );

          return tickets;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
      return tickets;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        switch (e.code) {
          case 'P2002': // unique constraint violation
          case 'P2034': // transaction conflict
            throw new Error('Some spots are already reserved');
        }
      }
      throw e;
    }
  }
}
