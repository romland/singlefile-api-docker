onload = () => {
    function elementHas(selector, buttonTexts)
    {
        var elements = document.querySelectorAll(selector);

        return Array.prototype.filter.call(elements, (element) => {
            return RegExp(buttonTexts, "i").test(element.textContent.trim());
        });
    }

    let dismissedCookieDialog = false;
    let fallbackExtract = false;
    const cookieDialogMatches = elementHas(
        '[aria-label*=cookie] button, [id*=modal] button, [class*=popup] button, [id*=onetrust-banner-sdk] button, [class*=overlay] button, [id*=cookie] a, [class*=cookie] a, [id*=cookie] button, [class*=cookie] button', 
        '^(Alle akzeptieren|Akzeptieren|Verstanden|Zustimmen|Okay|OK|Accept all|Accept|I understand|Agree|Got it|Accept All|Okej|Alles accepteren|Alle cookies accepteren|Doorgaan|Accepteer alles en sluit|Accept all cookies|Godkänn alla)$'
    );

    if (cookieDialogMatches != null && cookieDialogMatches.length != 0) { 
        cookieDialogMatches[0].click();
        dismissedCookieDialog = true;
    }

    const centerX = Math.abs(window.innerWidth/2);
    const centerY = Math.abs(window.innerHeight/2);
    let curr = document.elementFromPoint(centerX, centerY);

    const title = document.title;
    const url = window.location.href;
    const centerText = curr.innerText;
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
