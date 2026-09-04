import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { getParentDashboardData } from "@/lib/server/parent-dashboard";

type Context = {
  params: {
    athleteId: string;
  };
};

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Sessione non valida" },
        },
        { status: 401 },
      );
    }

    const data = await getParentDashboardData(
      session.db.user_id,
      context.params.athleteId,
      /*
        **Il cruscotto della famiglia lo apre un tutore** (ADR-0118). Il legame
        diretto `athletes.user_id` non basta: da questa rotta esce il payload
        intero — quote, ricevute, anagrafica dei tutori, contenuto clinico e
        indirizzo del file del certificato — mentre l'atleta di quella scheda
        ne riceve, dalla propria area, l'elenco chiuso di `CAMPI_AREA_ATLETA`.
        Una revisione ostile ha misurato che l'elenco chiuso valeva sulla
        proiezione e non sulla rotta.
      */
      { allowSelfAthleteLink: false },
    );

    if (!data) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Atleta non collegato a questo account" },
        },
        { status: 403 },
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message:
            error?.message || "Errore caricamento dashboard genitore",
        },
      },
      { status: 500 },
    );
  }
}
