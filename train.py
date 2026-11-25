"""Train and export a compact multinomial Naive Bayes intent classifier."""
import json
from pathlib import Path
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.naive_bayes import MultinomialNB

EXAMPLES = {
    "risk": [
        "Which items will run short", "show stockout risk", "where is demand uncovered",
        "which orders cannot be fulfilled", "what will go negative", "which products are at risk",
        "list shortages before replenishment", "will we have enough inventory",
        "which sales orders are short", "what should I expedite", "show the biggest shortage",
        "can we ship on time", "how many units short", "stock gap for this item"],
    "inbound": [
        "when is the next delivery", "show incoming purchases", "who is the supplier",
        "when will the purchase order arrive", "what replenishment is expected",
        "when is it coming", "show me the next receipt", "list inbound shipments",
        "who supplies the stock", "how many units are arriving", "show the vendor and arrival date",
        "when do we receive more", "when does it arrive", "incoming supply"],
    "balance": [
        "what is the current balance", "how many do we have on hand", "show opening stock",
        "how much is available now", "what is in the warehouse", "list inventory levels",
        "show bin quantities", "what is the ending balance", "show projected inventory",
        "how many are left after orders", "what is the final stock level", "show stock position",
        "stock on hand", "how does inventory change"],
}
texts = [text for group in EXAMPLES.values() for text in group]
labels = [label for label, group in EXAMPLES.items() for _ in group]
vectorizer = CountVectorizer(token_pattern=r"[a-z]+")
features = vectorizer.fit_transform(texts)
model = MultinomialNB(alpha=0.7).fit(features, labels)
artifact = {"vocabulary": vectorizer.vocabulary_, "labels": model.classes_.tolist(),
            "prior": model.class_log_prior_.tolist(), "weights": model.feature_log_prob_.tolist()}
Path(__file__).with_name("model.json").write_text(json.dumps(artifact, sort_keys=True) + "\n")
