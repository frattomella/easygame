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
        **Il cruscotto della famiglia lo apre un tutore** (ADR-0118, ADR-0122).

        Da qui esce il payload intero — quote, ricevute, anagrafica dei tutori,
        contenuto clinico e indirizzo del file del certificato — mentre
        l'atleta di quella scheda ne riceve, dalla propria area, l'elenco
        chiuso di `CAMPI_AREA_ATLETA`. Non c'e niente da dichiarare: dopo
        ADR-0122 il legame diretto e **chiuso per predefinito**, e questa riga
        e qui perche il prossimo lettore non lo riapra credendo di correggere
        una dimenticanza.
      */
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
