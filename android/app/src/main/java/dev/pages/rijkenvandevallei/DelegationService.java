package dev.pages.rijkenvandevallei;

import com.google.androidbrowserhelper.trusted.NotificationDelegationExtraCommandHandler;

/**
 * Laat Chrome de meldingen van het spel tonen als meldingen van deze app, en vraagt op Android 13+
 * de toestemming voor meldingen aan wanneer het spel daarom vraagt.
 */
public class DelegationService extends com.google.androidbrowserhelper.trusted.DelegationService {
    @Override
    public void onCreate() {
        super.onCreate();
        registerExtraCommandHandler(new NotificationDelegationExtraCommandHandler());
    }
}
