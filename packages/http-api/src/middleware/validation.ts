import { z } from "zod";
import { BadRequest } from "@ccflare/http-common";

export function validateBody(schema: z.ZodSchema<any>) {
    return (handler: (req: Request, url: URL, body: any) => Response | Promise<Response>) => {
        return async (req: Request, url: URL): Promise<Response> => {
            try {
                const body = await req.json();
                const parsed = await schema.parseAsync(body);
                return await handler(req, url, parsed);
            } catch (error) {
                if (error instanceof z.ZodError) {
                    throw BadRequest("Invalid request body", error.issues);
                }
                throw error;
            }
        };
    };
}
