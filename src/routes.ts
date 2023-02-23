import dayjs from "dayjs"
import { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "./lib/prisma"


export async function appRoutes(app: FastifyInstance) {

    app.get('/habits',async (req,rep) => {
        const habits = await prisma.habit.findMany()
    
        return rep.status(200).send(habits)
    })

    app.post('/habits', async (req,rep) => {

      try {
        const createHabitBody = z.object({
            title: z.string(),
            weekDays: z.array(
              z.number().min(0).max(6)
            ),
        })

        const {title, weekDays} = createHabitBody.parse(req.body)

        const today = dayjs().startOf('day').toDate()//fazendo assim para zerar as horas e nao complicar. 

        await prisma.habit.create({
            data: {
                title,
                createAt: today,

                habitWeekDays: {
                    create: weekDays.map((weekDay) => {
                        return {
                            week_day: weekDay,
                        }
                    })
                }

            }
        })

        rep.status(201).send('Created habit.')
      } catch (error) {
        console.log(error);
        rep.status(400).send('Algo deu errado!')
      }

    })

    app.get('/day',async (req,rep) => {
        
        try {

            const getDayParams = z.object({
                date: z.coerce.date() //para converter em data
            })
    
            const { date } = getDayParams.parse(req.query)

            const parsedDate = dayjs(date).startOf('day')
            const weekDay = parsedDate.get('day')

            const possibleHabits = await prisma.habit.findMany({
            where: {
                createAt: {
                lte: date,
                },
                habitWeekDays: {
                some: {
                    week_day: weekDay,
                }
                }
            },
            })

            const day = await prisma.day.findFirst({
            where: {
                date: parsedDate.toDate(),
            },
            include: {
                dayHabits: true,
            }
            })

            const completedHabits = day?.dayHabits.map(dayHabit => {
            return dayHabit.habit_id
            }) ?? []

            return {
                possibleHabits,
                completedHabits,
            }
                
            //rep.status(200).send({possibleHabits,completedHabits})
        } catch (error) {
            console.log(error);
            rep.status(400).send('Algo deu errado!')
        }

    })

    app.patch('/habits/:id/toggle',async (req,rep) => {

       try {
            const toggleHabitParams = z.object({
                id: z.string().uuid(),
            })

            const {id} = toggleHabitParams.parse(req.params)

            const today = dayjs().startOf('day').toDate()

            //use o let pra algo q nao tem ceteza q existe
            let day = await prisma.day.findUnique({
                where: {
                    date: today
                }
            })

            //validando se existe
            if (!day) {
                day = await prisma.day.create({
                    data: {
                        date: today,
                    }
                })
            }

            const dayHabit = await prisma.dayHabit.findUnique({
                where: {
                    day_id_habit_id: {
                        day_id: day.id,
                        habit_id: id,
                    }
                }
            })

            if(dayHabit){
                await prisma.dayHabit.delete({
                    where: {
                        id: dayHabit.id,
                    }
                })
            }else {
                //completando o habito
                await prisma.dayHabit.create({
                        data: {
                            day_id: day.id,
                            habit_id: id,
                        }
                    })
            }
            rep.status(200).send({msg: 'Modificado com sucesso!'})
       } catch (error) {
            console.log(error);
            rep.status(400).send({msg: 'Algo deu errado!'})
       }


    })

    app.get('/summary',async (req,rep) => {    
        //algo mais complexo vamos ter q fazer na mao, usando o raw.

        //iremos fazer uma sub queries pra resolver essa rota
        const summary = await prisma.$queryRaw`
            select 
                D.id, 
                D.date,
                (
                    select 
                        cast( count(*) as float )
                    from day_habit DH
                    where DH.day_id = D.id
                ) as completed,
                (
                    select 
                        cast( count(*) as float )
                    from habit_week_days HWD
                    join habit H
                        on H.id = HWD.habit_id
                    where 
                        HWD.week_day = cast(strftime('%w', D.date/1000.0, 'unixepoch') as int)
                        and H.createAt <= D.date
                ) as amount
            from days D 
        `

        rep.status(200).send(summary)

    })

}


