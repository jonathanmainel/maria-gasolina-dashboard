export type IngestionRequest = {
  client_slug?: string;
  start_date?: string;
  end_date?: string;
  dry_run?: boolean;
  refresh_video_previews_only?: boolean;
  video_picture_overrides?: Record<string, string>;
};

export type ValidatedIngestionRequest = {
  clientSlug: string;
  startDate: string;
  endDate: string;
  dryRun: boolean;
  refreshVideoPreviewsOnly: boolean;
  videoPictureOverrides: Record<string, string>;
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
    refresh_video_previews_only,
    video_picture_overrides,
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

  if (
    refresh_video_previews_only !== undefined &&
    typeof refresh_video_previews_only !== "boolean"
  ) {
    return {
      ok: false,
      status: 400,
      error: "refresh_video_previews_only must be a boolean.",
    };
  }

  const validatedVideoPictureOverrides: Record<string, string> = {};
  if (video_picture_overrides !== undefined) {
    if (
      !video_picture_overrides ||
      typeof video_picture_overrides !== "object" ||
      Array.isArray(video_picture_overrides)
    ) {
      return {
        ok: false,
        status: 400,
        error: "video_picture_overrides must be an object.",
      };
    }
    const entries = Object.entries(video_picture_overrides);
    if (entries.length > 100) {
      return {
        ok: false,
        status: 400,
        error: "video_picture_overrides supports at most 100 videos.",
      };
    }
    for (const [videoId, rawUrl] of entries) {
      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        return {
          ok: false,
          status: 400,
          error: "video_picture_overrides contains an invalid URL.",
        };
      }
      const host = parsed.hostname.toLowerCase();
      const trustedMetaHost = host === "facebook.com" ||
        host.endsWith(".facebook.com") || host.endsWith(".fbcdn.net");
      if (!/^\d+$/.test(videoId) || parsed.protocol !== "https:" || !trustedMetaHost) {
        return {
          ok: false,
          status: 400,
          error: "video_picture_overrides accepts only numeric video IDs and HTTPS Meta CDN URLs.",
        };
      }
      validatedVideoPictureOverrides[videoId] = parsed.toString();
    }
  }

  return {
    ok: true,
    value: {
      clientSlug: client_slug,
      startDate: start_date,
      endDate: end_date,
      dryRun: dry_run,
      refreshVideoPreviewsOnly: refresh_video_previews_only ?? false,
      videoPictureOverrides: validatedVideoPictureOverrides,
    },
  };
}
