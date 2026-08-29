const appleAppSiteAssociation = {
  applinks: {
    apps: [],
    details: [
      {
        appID: "4SSAVHCM6U.com.homeboard.native",
        paths: ["/invite/*"],
      },
    ],
  },
};

export function appleAppSiteAssociationResponse() {
  return new Response(JSON.stringify(appleAppSiteAssociation), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
