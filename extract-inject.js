onload = () => {
    function elementHas(selector, buttonTexts) {
        var elements = document.querySelectorAll(selector);
        return Array.prototype.filter.call(elements, (element) => {
            const cleanText = element.textContent.replace(/\s+/g, ' ').trim();
            return RegExp(buttonTexts, "i").test(cleanText);
        });
    }

    let dismissedCookieDialog = false;
    let fallbackExtract = false;
    
    // 1. Find and click the button
    const cookieDialogMatches = elementHas(
        '[aria-label*=cookie] button, [id*=modal] button, [class*=popup] button, [id*=onetrust-banner-sdk] button, [class*=overlay] button, [id*=cookie] a, [class*=cookie] a, [id*=cookie] button, [class*=cookie] button, .fc-cta-consent, [aria-label*="Consent"]', 
        '^(Alle akzeptieren|Akzeptieren|Verstanden|Zustimmen|Okay|OK|Accept all|Accept|I understand|Agree|Got it|Accept All|Okej|Alles accepteren|Alle cookies accepteren|Doorgaan|Accepteer alles en sluit|Accept all cookies|Godkänn alla|Consent)$'
    );

    if (cookieDialogMatches != null && cookieDialogMatches.length != 0) { 
        cookieDialogMatches[0].click();
        dismissedCookieDialog = true;
    }

    // 2. AGGRESSIVE DOM NUKE
    // Delete known CMP wrappers immediately so they don't block elementFromPoint
    document.querySelectorAll('.fc-consent-root, [id*=onetrust-banner], [id*=sp_message_container], [class*=cookie-overlay]').forEach(el => {
        el.remove();
    });

    // Unlock scrolling
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';

    // 3. Now get the center element
    const centerX = Math.abs(window.innerWidth/2);
    const centerY = Math.abs(window.innerHeight/2);
    let curr = document.elementFromPoint(centerX, centerY);

    const title = document.title;
    const url = window.location.href;
    const centerText = curr ? curr.innerText : "";
    const centerPath = document.elementsFromPoint(centerX, centerY).map(({ tagName }) => tagName).reverse().join(' > ');
    const heights = [];
    const extracts = [];
    
    let currentTallest = null;
    let currentTallestHeight = 0;
    let iterations = 100;
    while(curr.parentElement || iterations === 0) {
        const currHeight = curr.offsetHeight;
        heights.push([curr.tagName, currHeight]);

        if(curr.tagName === "HTML" || curr.tagName === "BODY") {
            curr = curr.parentElement;
            iterations--;
            continue;
        }

        if(currHeight > currentTallestHeight) {
            currentTallestHeight = currHeight;
            currentTallest = curr;
        }

        // Will only grab content that is taller than window height (I'm willing to sacrifice the loss)
        if(currHeight > window.innerHeight) {
            extracts.push(curr.innerText);
            break;
        }

        curr = curr.parentElement;
        iterations--;
    }

    // Fallback in case we did not find anything.
    if(extracts.length === 0) {
        extracts.push(currentTallest.innerText);
        fallbackExtract = true;
    }

    const htmlNode = document.getElementsByTagName("html")[0];
    const textNode = document.createComment("");
    htmlNode.prepend(textNode);

    textNode.textContent += "### META_EXTRACTION_START ###";
    textNode.textContent += JSON.stringify(
        { url, title, extracts, centerX, centerY, centerPath, centerText, heights, dismissedCookieDialog, fallbackExtract }
    );
    textNode.textContent += "### META_EXTRACTION_END ###";
}
