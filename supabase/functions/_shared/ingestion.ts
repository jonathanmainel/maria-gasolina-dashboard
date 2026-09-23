export type IngestionRequest = {
  client_slug?: string;
  start_date?: string;
  end_date?: string;
  dry_run?: boolean;
};

export type ValidatedIngestionRequest = {
  clientSlug: string;
  startDate: string;
  endDate: string;
  dryRun: boolean;
};

export type IngestionValidationResult =
  | {
      ok: true;
      value: ValidatedIngestionRequest;
    }
  | {
      ok: false;
      status: 400;
      error: string;
    };

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

export function validateIngestionRequest(
  body: IngestionRequest,
): IngestionValidationResult {
  const {
    client_slug,
    start_date,
    end_date,
    dry_run,
  } = body;

  if (!client_slug) {
    return {
      ok: false,
      status: 400,
      error: "client_slug is required.",
    };
  }

  if (!start_date || !isValidDate(start_date)) {
    return {
      ok: false,
      status: 400,
      error: "start_date must be a valid YYYY-MM-DD date.",
    };
  }

  if (!end_date || !isValidDate(end_date)) {
    return {
      ok: false,
      status: 400,
      error: "end_date must be a valid YYYY-MM-DD date.",
    };
  }

  if (start_date > end_date) {
    return {
      ok: false,
      status: 400,
      error: "start_date cannot be after end_date.",
    };
  }

  if (typeof dry_run !== "boolean") {
    return {
      ok: false,
      status: 400,
      error: "dry_run must be a boolean.",
    };
  }

  return {
    ok: true,
    value: {
      clientSlug: client_slug,
      startDate: start_date,
      endDate: end_date,
      dryRun: dry_run,
    },
  };
}
